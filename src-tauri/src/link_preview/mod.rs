mod cache;
mod capture;
mod disk_cache;
mod image_media_type;
mod metadata;
use image_media_type::ImageMediaType;
mod network;
mod queue;
mod sanitize;
use crate::{
  error::BackendResult, native_window::TrustedWindow as WebviewWindow, workspace::WorkspaceRegistry,
};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct Request {
  pub url: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CaptureRequest {
  pub url: String,
  pub request_id: String,
  #[serde(default)]
  pub priority: queue::Priority,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CaptureControl {
  pub request_id: String,
}
fn validate_id(value: &str) -> BackendResult<()> {
  uuid::Uuid::parse_str(value)
    .map(|_| ())
    .map_err(|_| crate::error::BackendError::new("INVALID_REQUEST", "Invalid preview request ID"))
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PreviewResult {
  Webpage {
    url: String,
    canonical: Option<String>,
    description: Option<String>,
    favicon: Option<String>,
    image: Option<String>,
    site_name: Option<String>,
    title: Option<String>,
  },
  Image {
    url: String,
    media_type: ImageMediaType,
    src: String,
  },
}
#[derive(Clone, Serialize, specta::Type)]
pub struct Capture {
  pub height: u32,
  pub width: u32,
  pub src: String,
  pub url: String,
}
#[derive(Clone)]
pub struct LinkPreviewService {
  inner: std::sync::Arc<cache::Inner>,
}
#[tauri::command]
#[specta::specta]
pub async fn link_preview_fetch(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  service: State<'_, LinkPreviewService>,
  request: Request,
) -> BackendResult<PreviewResult> {
  let workspace = registry.get(window.label())?;
  workspace.ensure_active()?;
  let result = service
    .fetch(&window, request.url, workspace.generation)
    .await?;
  workspace.ensure_active()?;
  if registry.get(window.label())?.generation != workspace.generation {
    return Err(network::failure(
      "Workspace changed before preview completed",
    ));
  }
  Ok(result)
}
#[tauri::command]
#[specta::specta]
pub async fn link_preview_capture(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  service: State<'_, LinkPreviewService>,
  request: CaptureRequest,
) -> BackendResult<Capture> {
  validate_id(&request.request_id)?;
  let workspace = registry.get(window.label())?;
  workspace.ensure_active()?;
  let result = service
    .capture(
      &window,
      request.url,
      workspace.generation,
      request.request_id,
      request.priority,
    )
    .await?;
  workspace.ensure_active()?;
  if registry.get(window.label())?.generation != workspace.generation {
    return Err(network::failure(
      "Workspace changed before preview completed",
    ));
  }
  Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn link_preview_cancel(
  window: WebviewWindow,
  service: State<'_, LinkPreviewService>,
  request: CaptureControl,
) -> BackendResult<()> {
  validate_id(&request.request_id)?;
  service
    .cancel_capture(window.label().into(), request.request_id)
    .await
}
#[tauri::command]
#[specta::specta]
pub async fn link_preview_promote(
  window: WebviewWindow,
  service: State<'_, LinkPreviewService>,
  request: CaptureControl,
) -> BackendResult<()> {
  validate_id(&request.request_id)?;
  service
    .promote_capture(window.label().into(), request.request_id)
    .await
}

fn ensure_generation(app: &tauri::AppHandle, owner: &str, generation: u64) -> BackendResult<()> {
  let workspace = app.state::<WorkspaceRegistry>().get(owner)?;
  if workspace.generation != generation {
    return Err(network::failure(
      "Workspace changed before preview completed",
    ));
  }
  workspace.ensure_active()
}
