use super::types::{
  CancelRequest, ChapterRequest, ExportFormat, MarkdownRequest, PublicationOptions,
  PublicationRequest, SourceDocument,
};
use super::{ExportService, assets};
use crate::error::{BackendError, BackendResult};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::platform::save_paths::{SavePathGrant, SavePathGrants};
use crate::workspace::{PathRequest, Workspace, WorkspaceRegistry};
use std::collections::HashSet;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn export_markdown(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  exports: State<'_, ExportService>,
  request: MarkdownRequest,
) -> BackendResult<String> {
  validate_output(&request.output_path, request.format)?;
  let grant = consume_grant(&window, &request.output_path).await?;
  let workspace = registry.get(window.label())?;
  let title = Path::new(&request.source_document_path)
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("Document")
    .to_owned();
  let chapters = vec![ChapterRequest {
    path: request.source_document_path,
    title: title.clone(),
  }];
  let options = PublicationOptions::document(request.format, title);
  exports.queue(
    window,
    workspace,
    chapters,
    options,
    request.output_path.into(),
    grant,
  )
}

#[tauri::command]
pub async fn export_workspace_publication(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  exports: State<'_, ExportService>,
  request: PublicationRequest,
) -> BackendResult<String> {
  request.options.validate()?;
  validate_output(&request.output_path, request.options.format)?;
  let mut paths = HashSet::new();
  if request.chapters.is_empty()
    || request.chapters.len() > 1000
    || !request
      .chapters
      .iter()
      .all(|chapter| paths.insert(&chapter.path))
  {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Publication chapters must be non-empty and unique",
    ));
  }
  let grant = consume_grant(&window, &request.output_path).await?;
  let workspace = registry.get(window.label())?;
  exports.queue(
    window,
    workspace,
    request.chapters,
    request.options,
    request.output_path.into(),
    grant,
  )
}

async fn consume_grant(window: &WebviewWindow, path: &str) -> BackendResult<SavePathGrant> {
  let app = window.app_handle().clone();
  let owner = window.label().to_owned();
  let path = path.to_owned();
  tokio::task::spawn_blocking(move || {
    let grants = app
      .try_state::<SavePathGrants>()
      .ok_or_else(|| BackendError::new("STATE_ERROR", "Save-path permissions are unavailable"))?;
    grants.consume(&owner, Path::new(&path))
  })
  .await
  .map_err(|error| BackendError::new("IO_ERROR", error.to_string()))?
}

#[tauri::command]
pub fn export_cancel(
  window: WebviewWindow,
  exports: State<'_, ExportService>,
  request: CancelRequest,
) -> BackendResult<bool> {
  exports.cancel(window.label(), &request.task_id)
}

#[tauri::command]
pub async fn export_open_output_path(
  app: AppHandle,
  window: WebviewWindow,
  exports: State<'_, ExportService>,
  request: PathRequest,
) -> BackendResult<()> {
  let path = Path::new(&request.path);
  if !exports.is_output(window.label(), path)? || !tokio::fs::metadata(path).await?.is_file() {
    return Err(BackendError::new(
      "UNAUTHORIZED_PATH",
      "Path is not an exported document owned by this window",
    ));
  }
  tokio::task::spawn_blocking(move || {
    app
      .opener()
      .open_path(&request.path, None::<&str>)
      .map_err(|error| BackendError::new("OPEN_FAILED", error.to_string()))
  })
  .await
  .map_err(|error| BackendError::new("OPEN_FAILED", error.to_string()))?
}

pub(super) async fn source(
  workspace: &Workspace,
  chapter: ChapterRequest,
) -> BackendResult<SourceDocument> {
  if chapter.path.is_empty()
    || chapter.path.len() > 2048
    || chapter.title.trim().is_empty()
    || chapter.title.chars().count() > 200
  {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Invalid export chapter",
    ));
  }
  let markdown = workspace.read_file(&chapter.path).await?;
  let (markdown, urls) = tokio::task::spawn_blocking(move || {
    let urls = assets::image_urls(&markdown);
    (markdown, urls)
  })
  .await
  .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", error.to_string()))?;
  let assets = assets::load(workspace, &chapter.path, urls).await?;
  Ok(SourceDocument {
    path: chapter.path,
    title: chapter.title,
    markdown,
    assets,
  })
}

pub fn validate_output(path: &str, format: ExportFormat) -> BackendResult<()> {
  let output = Path::new(path);
  if !output.is_absolute()
    || path.contains('\0')
    || output
      .extension()
      .and_then(|extension| extension.to_str())
      .is_none_or(|extension| !extension.eq_ignore_ascii_case(format.extension()))
  {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Export path must be absolute and match the selected format",
    ));
  }
  Ok(())
}
