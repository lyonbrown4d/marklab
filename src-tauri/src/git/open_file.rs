use super::{
  GitState, blocking,
  preview_file::{self, PreviewSource},
  process::error,
  safety,
  types::OpenFileRequest,
};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{assets::AssetService, error::BackendResult, workspace::WorkspaceRegistry};
use serde::Serialize;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;
#[derive(Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OpenFileResult {
  Opened,
  Preview {
    url: String,
    path: String,
    label: String,
    readonly: bool,
    snapshot: bool,
  },
}
async fn asset<T: Send + 'static>(
  window: &WebviewWindow,
  work: impl FnOnce(&AssetService) -> BackendResult<T> + Send + 'static,
) -> BackendResult<T> {
  let app = window.app_handle().clone();
  blocking::filesystem(move || work(&app.state::<AssetService>())).await
}
async fn system(window: &WebviewWindow, path: std::path::PathBuf) -> BackendResult<OpenFileResult> {
  let app = window.app_handle().clone();
  blocking::filesystem(move || {
    app
      .opener()
      .open_path(path.to_string_lossy(), None::<&str>)
      .map_err(|e| error("git_command_failed", &e.to_string()))?;
    Ok(OpenFileResult::Opened)
  })
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn git_open_file(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: OpenFileRequest,
) -> BackendResult<OpenFileResult> {
  let root = safety::workspace_root(&window, &registry, request.expected_root.as_deref())?;
  let workspace = registry.get(window.label())?;
  let lock = state.lock(&root).await;
  let _guard = lock.lock().await;
  let _workspace_guard = workspace.mutation.lock().await;
  registry.ensure_binding(window.label(), &workspace)?;
  if safety::workspace_root(&window, &registry, request.expected_root.as_deref())? != root {
    return Err(error(
      "git_workspace_boundary",
      "Workspace changed before opening the Git file",
    ));
  }
  safety::repository(&root, false).await?;
  let source = preview_file::source(&root, &request).await?;
  let (capability, path, file, label, readonly, snapshot) = match source {
    PreviewSource::Worktree { path, file, label } => {
      safety::worktree_path(&root, &file).await?;
      let canonical = tokio::fs::canonicalize(&path).await?;
      if !canonical.starts_with(&root) {
        return Err(error(
          "git_workspace_boundary",
          "Git file escaped the workspace",
        ));
      }
      let readonly = tokio::fs::metadata(&path).await?.permissions().readonly();
      if request.action == "system" {
        return system(&window, path).await;
      }
      let owner = window.label().to_owned();
      let issue_path = path.clone();
      let capability = asset(&window, move |service| {
        service.issue_path(&owner, &issue_path, readonly)
      })
      .await?;
      (capability, path, file, label, readonly, false)
    }
    PreviewSource::Blob { hash, file, label } => {
      let display = file.clone();
      let (temporary, output) = asset(&window, move |service| {
        let temporary = service.create_snapshot(&display)?;
        let output = temporary.as_file().try_clone()?;
        Ok((temporary, output))
      })
      .await?;
      preview_file::write_blob(&root, &hash, output).await?;
      let mut permissions = tokio::fs::metadata(temporary.path()).await?.permissions();
      permissions.set_readonly(true);
      tokio::fs::set_permissions(temporary.path(), permissions).await?;
      let mime = mime_guess::from_path(&file)
        .first_or_octet_stream()
        .to_string();
      let display = file.clone();
      let owner = window.label().to_owned();
      let (capability, path) = asset(&window, move |service| {
        let capability = service.issue_snapshot(&owner, temporary, &display, &mime)?;
        let path = service.resolve_capability_path(&owner, &capability.url)?;
        Ok((capability, path))
      })
      .await?;
      (capability, path, file, label, true, true)
    }
  };
  workspace.ensure_active()?;
  if request.action == "system" {
    return system(&window, path).await;
  }
  Ok(OpenFileResult::Preview {
    url: capability.url,
    path: file,
    label,
    readonly,
    snapshot,
  })
}
