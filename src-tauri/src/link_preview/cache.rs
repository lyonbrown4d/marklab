use super::{
  Capture, LinkPreviewService, PreviewResult, capture,
  disk_cache::DiskCache,
  ensure_generation, metadata, network,
  queue::{CaptureQueue, Priority},
};
use crate::{assets::AssetService, error::BackendResult, native_window::TrustedWindow};
use moka::future::Cache;
use sqlx::SqlitePool;
use std::{path::PathBuf, sync::Arc, time::Duration};
use tauri::Manager;
use tokio::sync::Semaphore;

type CacheKey = (String, u64, String);
#[derive(Clone)]
enum Fetched {
  Page(PreviewResult),
  Image {
    url: String,
    mime: String,
    bytes: Arc<Vec<u8>>,
  },
}
pub(super) struct Inner {
  cache: Cache<CacheKey, Fetched>,
  screenshots: Cache<String, Arc<Vec<u8>>>,
  disk: Arc<DiskCache>,
  semaphore: Semaphore,
  workers: capture::Workers,
  queue: CaptureQueue,
  maintenance: tokio::task::AbortHandle,
}
impl Drop for Inner {
  fn drop(&mut self) {
    self.maintenance.abort();
  }
}
fn weight(bytes: usize) -> u32 {
  // A 256KiB floor enforces at most 128 resident entries within 32MiB,
  // while larger images consume their real byte budget.
  bytes.max(256 * 1024).min(u32::MAX as usize) as u32
}
fn preview_weight(key: &CacheKey, value: &Fetched) -> u32 {
  let size = match value {
    Fetched::Image { url, mime, bytes } => url.len() + mime.len() + bytes.len(),
    Fetched::Page(PreviewResult::Webpage {
      url,
      canonical,
      description,
      favicon,
      image,
      site_name,
      title,
    }) => {
      url.len()
        + [canonical, description, favicon, image, site_name, title]
          .iter()
          .map(|s| s.as_ref().map_or(0, String::len))
          .sum::<usize>()
    }
    Fetched::Page(PreviewResult::Image { .. }) => 0,
  };
  weight(key.0.len() + key.2.len() + size + 256)
}
impl LinkPreviewService {
  pub async fn new(pool: SqlitePool, cache_root: PathBuf) -> BackendResult<Self> {
    let disk = DiskCache::new(pool, cache_root).await?;
    let maintenance = DiskCache::schedule(&disk);
    Ok(Self {
      inner: Arc::new(Inner {
        cache: Cache::builder()
          .max_capacity(32 * 1024 * 1024)
          .weigher(preview_weight)
          .time_to_live(Duration::from_secs(30 * 60))
          .support_invalidation_closures()
          .build(),
        screenshots: Cache::builder()
          .max_capacity(32 * 1024 * 1024)
          .weigher(|key: &String, bytes: &Arc<Vec<u8>>| weight(key.len() + bytes.len() + 64))
          .time_to_idle(Duration::from_secs(30 * 60))
          .build(),
        disk,
        semaphore: Semaphore::new(4),
        workers: capture::Workers::new()?,
        queue: CaptureQueue::new(),
        maintenance,
      }),
    })
  }
  pub async fn close_window(&self, owner: &str) {
    self.inner.queue.close(owner.into()).await;
    self.inner.workers.close_window(owner);
    let owner = owner.to_owned();
    if let Err(error) = self
      .inner
      .cache
      .invalidate_entries_if(move |key, _| key.0 == owner)
    {
      log::warn!("Cannot invalidate preview owner cache: {error}");
    }
    self.inner.cache.run_pending_tasks().await;
  }
  async fn load(&self, url: url::Url) -> BackendResult<Fetched> {
    let _permit = self
      .inner
      .semaphore
      .acquire()
      .await
      .map_err(|_| network::failure("Link preview service is closed"))?;
    let response = network::fetch(url).await?;
    crate::blocking::run(move || {
      if network::raster(&response.mime) {
        network::validate_raster(&response.bytes)?;
        Ok(Fetched::Image {
          url: response.url.into(),
          mime: response.mime,
          bytes: Arc::new(response.bytes),
        })
      } else {
        metadata::parse(&String::from_utf8_lossy(&response.bytes), &response.url).map(Fetched::Page)
      }
    })
    .await
  }
  pub(super) async fn fetch(
    &self,
    window: &TrustedWindow,
    url: String,
    generation: u64,
  ) -> BackendResult<PreviewResult> {
    let url = network::normalize(&url)?;
    let key = (window.label().to_owned(), generation, url.to_string());
    let result = self
      .inner
      .cache
      .try_get_with(key, self.load(url))
      .await
      .map_err(|error| (*error).clone())?;
    match result {
      Fetched::Page(result) => Ok(result),
      Fetched::Image { url, mime, bytes } => {
        let capability = issue(window, generation, bytes, mime.clone()).await?;
        Ok(PreviewResult::Image {
          url,
          media_type: mime,
          src: capability,
        })
      }
    }
  }
  pub(super) async fn capture(
    &self,
    window: &TrustedWindow,
    url: String,
    generation: u64,
    id: String,
    priority: Priority,
  ) -> BackendResult<Capture> {
    let url = network::normalize(&url)?.to_string();
    let bytes = if let Some(bytes) = self.inner.screenshots.get(&url).await {
      bytes
    } else {
      let service = self.clone();
      let window = window.clone();
      let target = url.clone();
      self
        .inner
        .queue
        .enqueue(
          (window.label().into(), generation, url.clone()),
          id,
          priority,
          Box::pin(async move { service.capture_bytes(&window, target, generation).await }),
        )?
        .wait()
        .await?
    };
    // Memory hits count as disk-cache activity as well. Maintenance is best effort.
    if let Err(error) = self.inner.disk.touch(&url).await {
      log::warn!("Preview cache touch failed: {}", error.code);
    }
    let src = issue(window, generation, bytes, "image/png".into()).await?;
    Ok(Capture {
      width: 1920,
      height: 1080,
      src,
      url,
    })
  }
  pub(super) async fn cancel_capture(&self, owner: String, id: String) -> BackendResult<()> {
    self.inner.queue.cancel(owner, id).await
  }
  pub(super) async fn promote_capture(&self, owner: String, id: String) -> BackendResult<()> {
    self.inner.queue.promote(owner, id).await
  }
  async fn capture_bytes(
    &self,
    window: &TrustedWindow,
    url: String,
    generation: u64,
  ) -> BackendResult<Arc<Vec<u8>>> {
    ensure_generation(window.app_handle(), window.label(), generation)?;
    self
      .inner
      .screenshots
      .try_get_with(url.clone(), async {
        match self.inner.disk.get(&url).await {
          Ok(Some(bytes)) => {
            match crate::blocking::run(move || capture::normalize_image(bytes)).await {
              Ok(bytes) => return Ok(Arc::new(bytes)),
              Err(error) => {
                log::warn!("Invalid preview cache image: {}", error.code);
                if let Err(error) = self.inner.disk.invalidate(&url).await {
                  log::warn!("Cannot remove preview cache image: {}", error.code);
                }
              }
            }
          }
          Ok(None) => (),
          Err(error) => log::warn!("Preview cache read failed: {}", error.code),
        }
        let bytes =
          Arc::new(capture::capture(&self.inner.workers, window, url.clone(), generation).await?);
        if let Err(error) = self.inner.disk.set(&url, bytes.clone()).await {
          log::warn!("Preview cache write failed: {}", error.code);
        }
        Ok::<_, crate::error::BackendError>(bytes)
      })
      .await
      .map_err(|error| (*error).clone())
  }
}
async fn issue(
  window: &TrustedWindow,
  generation: u64,
  bytes: Arc<Vec<u8>>,
  mime: String,
) -> BackendResult<String> {
  let owner = window.label().to_owned();
  let app = window.app_handle().clone();
  crate::blocking::run(move || {
    ensure_generation(&app, &owner, generation)?;
    app
      .state::<AssetService>()
      .issue_remote_bytes(&owner, &bytes, &mime)
      .map(|capability| capability.url)
  })
  .await
}

#[cfg(test)]
#[path = "cache_tests.rs"]
mod tests;
