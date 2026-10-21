use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  error::{BackendError, BackendResult},
  workspace::types::EmptyRequest,
};
use base64::Engine;
use clipboard_rs::{Clipboard, ClipboardContent, ClipboardContext};
use image::ImageEncoder;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;

// Keep Linux selection ownership alive. The official plugin handles ordinary
// clipboard access; this library adds the existing text/markdown representation.
#[derive(Default)]
pub struct RichClipboard(std::sync::Mutex<Option<ClipboardContext>>);

fn failure(error: impl std::fmt::Display) -> BackendError {
  BackendError::new("CLIPBOARD_FAILED", error.to_string())
}
pub use PlatformOkResult as OkResult;
#[derive(Serialize, specta::Type)]
pub struct PlatformOkResult {
  pub ok: bool,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct TextRequest {
  text: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct ContentRequest {
  #[serde(default)]
  html: Option<String>,
  markdown: String,
  text: String,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImage {
  data_url: String,
  width: u32,
  height: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn clipboard_read_text(
  window: WebviewWindow,
  request: EmptyRequest,
) -> BackendResult<String> {
  let _ = request;
  let text =
    tauri::async_runtime::spawn_blocking(move || window.clipboard().read_text().map_err(failure))
      .await
      .map_err(failure)??;
  if text.len() > 8 * 1024 * 1024 {
    return Err(BackendError::new(
      "CLIPBOARD_TOO_LARGE",
      "Clipboard text exceeds 8 MiB",
    ));
  }
  Ok(text)
}
#[tauri::command]
#[specta::specta]
pub async fn clipboard_write_text(
  window: WebviewWindow,
  request: TextRequest,
) -> BackendResult<OkResult> {
  tauri::async_runtime::spawn_blocking(move || {
    window
      .clipboard()
      .write_text(request.text)
      .map_err(failure)?;
    Ok(OkResult { ok: true })
  })
  .await
  .map_err(failure)?
}
#[tauri::command]
#[specta::specta]
pub async fn clipboard_write(
  window: WebviewWindow,
  request: ContentRequest,
) -> BackendResult<OkResult> {
  crate::blocking::run(move || {
    let store = window.state::<RichClipboard>();
    let mut context = store.0.lock().map_err(failure)?;
    if context.is_none() {
      *context = Some(ClipboardContext::new().map_err(failure)?);
    }
    let context = context
      .as_ref()
      .ok_or_else(|| failure("Rich clipboard is unavailable"))?;
    let mut content = vec![
      ClipboardContent::Text(request.text),
      ClipboardContent::Other("text/markdown".into(), request.markdown.into_bytes()),
    ];
    if let Some(html) = request.html.filter(|html| !html.is_empty()) {
      content.push(ClipboardContent::Html(html));
    }
    context.set(content).map_err(failure)?;
    Ok(OkResult { ok: true })
  })
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn clipboard_read_image(
  window: WebviewWindow,
  request: EmptyRequest,
) -> BackendResult<Option<ClipboardImage>> {
  let _ = request;
  tauri::async_runtime::spawn_blocking(move || {
    let image = match window.clipboard().read_image() {
      Ok(image) => image,
      Err(_) => return Ok(None),
    };
    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
      .write_image(
        image.rgba(),
        image.width(),
        image.height(),
        image::ExtendedColorType::Rgba8,
      )
      .map_err(failure)?;
    Ok(Some(ClipboardImage {
      data_url: format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
      ),
      width: image.width(),
      height: image.height(),
    }))
  })
  .await
  .map_err(failure)?
}
