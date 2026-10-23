use super::{
  Capture, ImageMediaType, LinkPreviewService, PreviewResult, capture,
  disk_cache::DiskCache,
  ensure_generation, metadata, network,
  queue::{CaptureQueue, Priority},
};
use crate::{assets::AssetService, error::BackendResult, native_window::TrustedWindow};
use moka::future::Cache;
use sqlx::SqlitePool;
use std::{path::PathBuf, sync::Arc, time::Duration};
use tauri::Manager;
use tokio::sync::{Mutex, Semaphore};
#[path = "screenshots.rs"]
mod screenshots;

type CacheKey = (String, u64, String);
#[derive(Clone)]
struct Screenshot {
  bytes: Arc<Vec<u8>>,
  captured_at: i64,
}
#[derive(Clone)]
enum Fetched {
  Page(PreviewResult),
  Image {
    url: String,
    media_type: ImageMediaType,
    bytes: Arc<Vec<u8>>,
  },
}
pub(super) struct Inner {
  cache: Cache<CacheKey, Fetched>,
  screenshots: Cache<String, Screenshot>,
  screenshot_writes: Mutex<LiveCaptureOrder>,
  disk: Arc<DiskCache>,
  semaphore: Semaphore,
  workers: capture::Workers,
  queue: CaptureQueue,
  maintenance: tokio::task::AbortHandle,
}
#[derive(Clone)]
struct LiveRequest {
  identity: String,
  sequence: u64,
}
struct LiveCaptureOrder {
  sequence: u64,
  latest: moka::sync::Cache<String, LiveRequest>,
}
impl Default for LiveCaptureOrder {
  fn default() -> Self {
    Self {
      sequence: 0,
      latest: moka::sync::Cache::builder()
        .max_capacity(128)
        .time_to_live(Duration::from_secs(30 * 60))
        .build(),
    }
  }
}
impl LiveCaptureOrder {
  fn request(&mut self, url: &str, identity: &str) -> BackendResult<u64> {
    if let Some(latest) = self.latest.get(url)
      && latest.identity == identity
    {
      return Ok(latest.sequence);
    }
    self.sequence = self
      .sequence
      .checked_add(1)
      .ok_or_else(|| network::failure("Preview capture sequence exhausted"))?;
    self.latest.insert(
      url.into(),
      LiveRequest {
        identity: identity.into(),
        sequence: self.sequence,
      },
    );
    Ok(self.sequence)
  }
  fn ensure_current(&self, url: &str, sequence: u64) -> BackendResult<()> {
    // Eviction also cancels pending old work: an absent marker cannot authorize
    // a result to overwrite a newer image in the separately bounded byte cache.
    if !self
      .latest
      .get(url)
      .is_some_and(|latest| latest.sequence == sequence)
    {
      return Err(super::queue::cancelled());
    }
    Ok(())
  }
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
    Fetched::Image {
      url,
      media_type,
      bytes,
    } => url.len() + media_type.as_str().len() + bytes.len(),
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
          .weigher(|key: &String, value: &Screenshot| weight(key.len() + value.bytes.len() + 72))
          .time_to_live(Duration::from_secs(30 * 60))
          .build(),
        disk,
        screenshot_writes: Mutex::new(LiveCaptureOrder::default()),
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
      if let Some(media_type) = ImageMediaType::from_mime(&response.mime) {
        network::validate_raster(&response.bytes)?;
        Ok(Fetched::Image {
          url: response.url.into(),
          media_type,
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
      Fetched::Image {
        url,
        media_type,
        bytes,
      } => {
        let capability = issue(window, generation, bytes, media_type.as_str().into()).await?;
        Ok(PreviewResult::Image {
          url,
          media_type,
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
    let bytes = if let Some(bytes) = self.memory_screenshot(&url).await {
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
