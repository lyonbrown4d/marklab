use super::super::network::failure;
use crate::error::BackendResult;
#[cfg(target_os = "macos")]
pub async fn snapshot(view: &tauri::Webview) -> BackendResult<Vec<u8>> {
  use objc2::{AnyThread, MainThreadMarker, runtime::AnyObject};
  use objc2_app_kit::{
    NSBitmapImageFileType, NSBitmapImageRep, NSBitmapImageRepPropertyKey, NSImage,
  };
  use objc2_foundation::{NSDictionary, NSError, NSNumber};
  use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
  let (sender, receiver) = tokio::sync::oneshot::channel();
  let sender = std::sync::Arc::new(std::sync::Mutex::new(Some(sender)));
  view.with_webview(move |platform| {
    let result = || -> BackendResult<()> {
      let mtm = MainThreadMarker::new()
        .ok_or_else(|| failure("Native capture requires the macOS main thread"))?;
      // Tauri owns the WKWebView and executes this callback on its UI thread.
      let webview = unsafe { &*(platform.inner() as *const WKWebView) };
      let configuration = unsafe { WKSnapshotConfiguration::new(mtm) };
      unsafe {
        configuration.setSnapshotWidth(Some(&NSNumber::new_f64(1920.)));
        configuration.setAfterScreenUpdates(false);
      }
      let completion_sender = sender.clone();
      let completion = block2::RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        let result = || -> BackendResult<Vec<u8>> {
          if image.is_null() || !error.is_null() {
            return Err(failure("WKWebView could not capture the isolated document"));
          }
          let image = unsafe { &*image };
          let tiff = image
            .TIFFRepresentation()
            .ok_or_else(|| failure("Native capture image is empty"))?;
          let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)
            .ok_or_else(|| failure("Cannot decode native capture"))?;
          let properties = NSDictionary::<NSBitmapImageRepPropertyKey, AnyObject>::new();
          let png = unsafe {
            bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
          }
          .ok_or_else(|| failure("Cannot encode native capture"))?;
          Ok(png.to_vec())
        }();
        if let Ok(mut sender) = completion_sender.lock()
          && let Some(sender) = sender.take()
        {
          let _ = sender.send(result);
        }
      });
      unsafe {
        webview.takeSnapshotWithConfiguration_completionHandler(Some(&configuration), &completion);
      }
      Ok(())
    }();
    if let Err(error) = result
      && let Ok(mut sender) = sender.lock()
      && let Some(sender) = sender.take()
    {
      let _ = sender.send(Err(error));
    }
  })?;
  receiver
    .await
    .map_err(|_| failure("Native capture callback was cancelled"))?
}
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
pub use linux::snapshot;
#[cfg(target_os = "windows")]
pub use windows::snapshot;
