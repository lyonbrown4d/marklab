use super::{BackendResult, failure};
use base64::Engine;
use std::sync::{
  Arc, Mutex,
  atomic::{AtomicBool, Ordering},
};
use tauri_runtime_cef::{
  WebviewCefExt, allocate_devtools_message_id,
  cef::{self, *},
};

const MAX_PNG_BYTES: usize = 32 * 1024 * 1024;
const MAX_RESULT_BYTES: usize = (MAX_PNG_BYTES.div_ceil(3) * 4) + 1024;
type CaptureSender = tokio::sync::oneshot::Sender<BackendResult<Vec<u8>>>;
#[derive(Default)]
struct CaptureState {
  sender: Mutex<Option<CaptureSender>>,
  registration: Mutex<Option<Registration>>,
  cancelled: AtomicBool,
}
impl CaptureState {
  fn finish(&self, result: BackendResult<Vec<u8>>) {
    if let Ok(mut sender) = self.sender.lock()
      && let Some(sender) = sender.take()
    {
      let _ = sender.send(result);
    }
    // CEF invokes result callbacks on its UI thread, which also owns registration.
    if let Ok(mut registration) = self.registration.lock() {
      registration.take();
    }
  }
}
struct CaptureGuard {
  view: tauri::Webview,
  state: Arc<CaptureState>,
}
impl Drop for CaptureGuard {
  fn drop(&mut self) {
    self.state.cancelled.store(true, Ordering::Release);
    let state = self.state.clone();
    let _ = self.view.with_cef_webview(move |_| {
      state.finish(Err(failure("Native capture was cancelled")));
    });
  }
}
cef::wrap_dev_tools_message_observer! {
  struct CaptureObserver {
    message_id: i32,
    state: Arc<CaptureState>,
  }
  impl DevToolsMessageObserver {
    fn on_dev_tools_method_result(
      &self,
      _browser: Option<&mut Browser>,
      message_id: std::os::raw::c_int,
      success: std::os::raw::c_int,
      result: Option<&[u8]>,
    ) {
      if message_id != self.message_id {
        return;
      }
      let result = if success == 0 {
        Err(failure("CEF could not capture the isolated document"))
      } else {
        result.filter(|bytes| bytes.len() <= MAX_RESULT_BYTES)
          .map(Vec::from)
          .ok_or_else(|| failure("Native capture result is absent or oversized"))
      };
      self.state.finish(result);
    }
  }
}

pub async fn snapshot(view: &tauri::Webview) -> BackendResult<Vec<u8>> {
  let size = view.size()?;
  super::super::image_geometry::validate_size(size.width, size.height)?;
  let density = view.window().scale_factor()?;
  if !density.is_finite() || density <= 0. {
    return Err(failure("Invalid native capture scale"));
  }
  let width = f64::from(size.width) / density;
  let height = f64::from(size.height) / density;
  // Clip the visible document and reduce resolution before Chromium allocates pixels.
  let scale = (1920. / f64::from(size.width))
    .min(1080. / f64::from(size.height))
    .min(1. / density);
  let message_id = allocate_devtools_message_id()
    .map_err(|_| failure("Native capture identifiers are exhausted"))?;
  let message = serde_json::json!({
    "id": message_id, "method": "Page.captureScreenshot", "params": {
      "format": "png", "fromSurface": true, "captureBeyondViewport": false,
      "clip": { "x": 0, "y": 0, "width": width, "height": height, "scale": scale }
    }
  })
  .to_string();
  let (sender, receiver) = tokio::sync::oneshot::channel();
  let state = Arc::new(CaptureState::default());
  *state
    .sender
    .lock()
    .map_err(|_| failure("Native capture state is unavailable"))? = Some(sender);
  let _guard = CaptureGuard {
    view: view.clone(),
    state: state.clone(),
  };
  view.with_cef_webview(move |platform| {
    if state.cancelled.load(Ordering::Acquire) {
      return;
    }
    let result = || -> BackendResult<()> {
      let host = platform
        .browser()
        .host()
        .ok_or_else(|| failure("Native capture browser is detached"))?;
      let mut observer = CaptureObserver::new(message_id, state.clone());
      let registration = host
        .add_dev_tools_message_observer(Some(&mut observer))
        .ok_or_else(|| failure("Cannot observe native capture"))?;
      *state
        .registration
        .lock()
        .map_err(|_| failure("Native capture state is unavailable"))? = Some(registration);
      if host.send_dev_tools_message(Some(message.as_bytes())) != 1 {
        return Err(failure("CEF rejected native capture"));
      }
      Ok(())
    }();
    if let Err(error) = result {
      state.finish(Err(error));
    }
  })?;
  let result = tokio::time::timeout(std::time::Duration::from_secs(5), receiver)
    .await
    .map_err(|_| failure("Native capture timed out"))?
    .map_err(|_| failure("Native capture callback was cancelled"))??;
  crate::blocking::run(move || decode_result(&result)).await
}

fn decode_result(result: &[u8]) -> BackendResult<Vec<u8>> {
  #[derive(serde::Deserialize)]
  struct Screenshot {
    data: String,
  }
  let value: Screenshot = serde_json::from_slice(result)
    .map_err(|_| failure("Native capture returned an invalid result"))?;
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(value.data)
    .map_err(|_| failure("Native capture returned invalid PNG data"))?;
  if bytes.len() > MAX_PNG_BYTES {
    return Err(failure("Native capture exceeds maximum encoded size"));
  }
  let dimensions = image::ImageReader::with_format(
    std::io::Cursor::new(bytes.as_slice()),
    image::ImageFormat::Png,
  )
  .into_dimensions()
  .map_err(|_| failure("Native capture returned an invalid image"))?;
  super::super::image_geometry::validate_size(dimensions.0, dimensions.1)?;
  Ok(bytes)
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn decodes_native_png_and_rejects_malformed_or_oversized_pixels() {
    let image = image::RgbaImage::new(20, 10);
    let mut encoded = std::io::Cursor::new(Vec::new());
    image
      .write_to(&mut encoded, image::ImageFormat::Png)
      .unwrap();
    let png = encoded.into_inner();
    let response =
      serde_json::json!({"data": base64::engine::general_purpose::STANDARD.encode(&png)});
    assert_eq!(
      decode_result(&serde_json::to_vec(&response).unwrap()).unwrap(),
      png
    );
    for response in [
      b"{}".as_slice(),
      br#"{"data":"!!"}"#,
      br#"{"data":"bm90IHBuZw=="}"#,
    ] {
      assert!(decode_result(response).is_err());
    }
    let image = image::RgbaImage::new(8193, 1);
    let mut encoded = std::io::Cursor::new(Vec::new());
    image
      .write_to(&mut encoded, image::ImageFormat::Png)
      .unwrap();
    let response = serde_json::json!({"data": base64::engine::general_purpose::STANDARD.encode(encoded.into_inner())});
    assert!(decode_result(&serde_json::to_vec(&response).unwrap()).is_err());
  }
}
