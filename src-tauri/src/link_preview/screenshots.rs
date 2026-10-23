use super::*;
use crate::{desktop::event_contracts::LINK_PREVIEW_UPDATED, link_preview::PreviewUpdated};

#[derive(Clone, Copy)]
struct LiveVersion {
  navigation: u64,
  request: u64,
}
#[derive(Clone, Copy)]
enum CaptureSource {
  Live(u64),
  Static(i64),
}

impl LinkPreviewService {
  // Called only by native WebTabs lifecycle code, never exposed to remote pages.
  pub async fn capture_web_tab(
    &self,
    window: TrustedWindow,
    view: tauri::Webview,
    url: String,
    generation: u64,
  ) -> BackendResult<()> {
    let url = network::normalize(&url)?.to_string();
    let revision =
      live_revision(&window, &view, &url).ok_or_else(super::super::queue::cancelled)?;
    let identity = format!("{}:{revision}", view.label());
    let request = self
      .begin_validated_live_capture(&url, &identity, || {
        validate_live(&window, &view, &url, generation, revision)
      })
      .await?;
    let version = LiveVersion {
      navigation: revision,
      request,
    };
    let service = self.clone();
    self
      .inner
      .queue
      .enqueue(
        (
          window.label().into(),
          generation,
          format!("live:{identity}:{request}:{url}"),
        ),
        uuid::Uuid::new_v4().to_string(),
        Priority::Interactive,
        Box::pin(async move {
          service
            .capture_live(&window, &view, url, generation, version)
            .await
        }),
      )?
      .wait()
      .await?;
    Ok(())
  }

  async fn capture_live(
    &self,
    window: &TrustedWindow,
    view: &tauri::Webview,
    url: String,
    generation: u64,
    version: LiveVersion,
  ) -> BackendResult<Arc<Vec<u8>>> {
    validate_live(window, view, &url, generation, version.navigation)?;
    // Let the completed navigation paint without running work in React.
    tokio::time::sleep(Duration::from_millis(350)).await;
    validate_live(window, view, &url, generation, version.navigation)?;
    let bytes = tokio::time::timeout(Duration::from_secs(10), capture::snapshot(view))
      .await
      .map_err(|_| network::failure("Web tab preview capture timed out"))??;
    let bytes = Arc::new(crate::blocking::run(move || capture::normalize_image(bytes)).await?);
    validate_live(window, view, &url, generation, version.navigation)?;
    let write = self.inner.screenshot_writes.lock().await;
    validate_live(window, view, &url, generation, version.navigation)?;
    let bytes = self
      .commit_screenshot(&url, bytes, CaptureSource::Live(version.request), &write)
      .await?;
    validate_live(window, view, &url, generation, version.navigation)?;
    self
      .inner
      .cache
      .invalidate(&(window.label().into(), generation, url.clone()))
      .await;
    // Publish only after both native caches can supply the new image.
    LINK_PREVIEW_UPDATED.emit_to(
      window.app_handle(),
      tauri::EventTarget::webview_window(window.label()),
      &PreviewUpdated {
        capture: Capture {
          width: 1920,
          height: 1080,
          src: issue(window, generation, bytes.clone(), "image/png".into()).await?,
          url,
        },
        generation,
      },
    )?;
    Ok(bytes)
  }

  pub(super) async fn capture_bytes(
    &self,
    window: &TrustedWindow,
    url: String,
    generation: u64,
  ) -> BackendResult<Arc<Vec<u8>>> {
    ensure_generation(window.app_handle(), window.label(), generation)?;
    let started = crate::assets::now_ms().min(i64::MAX as u64) as i64;
    {
      let _write = self.inner.screenshot_writes.lock().await;
      if let Some(bytes) = self.memory_screenshot(&url).await {
        return Ok(bytes);
      }
      if let Some(screenshot) = self.cached_disk_bytes(&url).await {
        self
          .inner
          .screenshots
          .insert(url.clone(), screenshot.clone())
          .await;
        return Ok(screenshot.bytes);
      }
    }
    let bytes =
      Arc::new(capture::capture(&self.inner.workers, window, url.clone(), generation).await?);
    ensure_generation(window.app_handle(), window.label(), generation)?;
    let write = self.inner.screenshot_writes.lock().await;
    self
      .commit_screenshot(&url, bytes, CaptureSource::Static(started), &write)
      .await
  }

  #[cfg(test)]
  async fn begin_live_capture(&self, url: &str, identity: &str) -> BackendResult<u64> {
    self
      .begin_validated_live_capture(url, identity, || Ok(()))
      .await
  }

  async fn begin_validated_live_capture(
    &self,
    url: &str,
    identity: &str,
    validate: impl FnOnce() -> BackendResult<()>,
  ) -> BackendResult<u64> {
    let mut order = self.inner.screenshot_writes.lock().await;
    validate()?;
    order.request(url, identity)
  }

  async fn commit_screenshot(
    &self,
    url: &str,
    bytes: Arc<Vec<u8>>,
    source: CaptureSource,
    write: &LiveCaptureOrder,
  ) -> BackendResult<Arc<Vec<u8>>> {
    if let CaptureSource::Live(sequence) = source {
      write.ensure_current(url, sequence)?;
    }
    // A real page may have completed while an older static worker was busy.
    // Prefer its committed image and never overwrite it with anonymous HTML.
    if let CaptureSource::Static(started) = source {
      if let Some(current) = self.memory_screenshot(url).await {
        return Ok(current);
      }
      if self
        .inner
        .disk
        .captured_at(url)
        .await?
        .is_some_and(|at| at >= started)
        && let Some(current) = self.cached_disk_bytes(url).await
      {
        self
          .inner
          .screenshots
          .insert(url.into(), current.clone())
          .await;
        return Ok(current.bytes);
      }
    }
    self.persist_screenshot(url, bytes.clone()).await;
    Ok(bytes)
  }

  async fn persist_screenshot(&self, url: &str, bytes: Arc<Vec<u8>>) {
    let captured_at = crate::assets::now_ms().min(i64::MAX as u64) as i64;
    if let Err(error) = self.inner.disk.set(url, bytes.clone()).await {
      log::warn!("Preview cache write failed: {}", error.code);
    }
    self
      .inner
      .screenshots
      .insert(url.into(), Screenshot { bytes, captured_at })
      .await;
  }

  pub(super) async fn memory_screenshot(&self, url: &str) -> Option<Arc<Vec<u8>>> {
    let screenshot = self.inner.screenshots.get(url).await?;
    let now = crate::assets::now_ms().min(i64::MAX as u64) as i64;
    if screenshot.captured_at > 0
      && now.saturating_sub(screenshot.captured_at) <= super::super::disk_cache::TTL_MS
    {
      Some(screenshot.bytes)
    } else {
      self.inner.screenshots.invalidate(url).await;
      None
    }
  }

  async fn cached_disk_bytes(&self, url: &str) -> Option<Screenshot> {
    match self.inner.disk.get_with_timestamp(url).await {
      Ok(Some((bytes, captured_at))) => {
        match crate::blocking::run(move || capture::normalize_image(bytes)).await {
          Ok(bytes) => Some(Screenshot {
            bytes: Arc::new(bytes),
            captured_at,
          }),
          Err(error) => {
            log::warn!("Invalid preview cache image: {}", error.code);
            if let Err(error) = self.inner.disk.invalidate(url).await {
              log::warn!("Cannot remove preview cache image: {}", error.code);
            }
            None
          }
        }
      }
      Ok(None) => None,
      Err(error) => {
        log::warn!("Preview cache read failed: {}", error.code);
        None
      }
    }
  }
}

fn validate_live(
  window: &TrustedWindow,
  view: &tauri::Webview,
  url: &str,
  generation: u64,
  revision: u64,
) -> BackendResult<()> {
  ensure_generation(window.app_handle(), window.label(), generation)?;
  if live_revision(window, view, url) != Some(revision)
    || window.app_handle().get_webview(view.label()).is_none()
    || view.url()?.as_str() != url
  {
    return Err(super::super::queue::cancelled());
  }
  Ok(())
}

fn live_revision(window: &TrustedWindow, view: &tauri::Webview, url: &str) -> Option<u64> {
  window
    .state::<crate::web_tabs::WebTabs>()
    .preview_revision(window.label(), view.label(), url)
}

#[cfg(test)]
#[path = "screenshots_tests.rs"]
mod tests;
