use super::{BackendResult, failure};
use webview2_com::{
  CapturePreviewCompletedHandler,
  Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
};
use windows::Win32::{
  Foundation::HGLOBAL,
  System::Com::{
    IStream, STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET, StructuredStorage::CreateStreamOnHGlobal,
  },
};

pub async fn snapshot(view: &tauri::Webview) -> BackendResult<Vec<u8>> {
  let size = view.size()?;
  super::super::image_geometry::validate_size(size.width, size.height)?;
  let (sender, receiver) = tokio::sync::oneshot::channel();
  let sender = std::sync::Arc::new(std::sync::Mutex::new(Some(sender)));
  view.with_webview(move |platform| {
    let result = (|| -> BackendResult<()> {
      // The stream remains on this COM/UI thread. Its owned HGLOBAL is
      // released automatically after the capture completion callback.
      let stream =
        unsafe { CreateStreamOnHGlobal(HGLOBAL::default(), true) }.map_err(native_error)?;
      let captured = stream.clone();
      let completed = sender.clone();
      let handler = CapturePreviewCompletedHandler::create(Box::new(move |status| {
        let result = status
          .map_err(native_error)
          .and_then(|_| read_stream(&captured));
        if let Ok(mut sender) = completed.lock()
          && let Some(sender) = sender.take()
        {
          let _ = sender.send(result);
        }
        Ok(())
      }));
      let webview = unsafe { platform.controller().CoreWebView2() }.map_err(native_error)?;
      unsafe {
        webview.CapturePreview(
          COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
          &stream,
          &handler,
        )
      }
      .map_err(native_error)
    })();
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
fn read_stream(stream: &IStream) -> BackendResult<Vec<u8>> {
  let mut stat = STATSTG::default();
  unsafe { stream.Stat(&mut stat, STATFLAG_NONAME) }.map_err(native_error)?;
  if stat.cbSize > 32 * 1024 * 1024 {
    return Err(failure("Native capture exceeds maximum encoded size"));
  }
  unsafe { stream.Seek(0, STREAM_SEEK_SET, None) }.map_err(native_error)?;
  let mut bytes = vec![0; stat.cbSize as usize];
  let mut read = 0;
  // SAFETY: bytes has the exact writable allocation size passed to COM.
  unsafe {
    stream.Read(
      bytes.as_mut_ptr().cast(),
      bytes.len() as u32,
      Some(&mut read),
    )
  }
  .ok()
  .map_err(native_error)?;
  if read as usize != bytes.len() {
    return Err(failure("Native capture stream ended early"));
  }
  Ok(bytes)
}
fn native_error(error: windows::core::Error) -> crate::error::BackendError {
  failure(&format!("WebView2 capture failed: {error}"))
}
