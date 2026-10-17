use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
    error::{BackendError, BackendResult},
    workspace::{WorkspaceRegistry, types::PathRequest},
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncReadExt;

#[derive(Serialize)]
pub struct ShellResult {
    ok: bool,
    path: String,
}

async fn absolute_path(path: &str) -> BackendResult<PathBuf> {
    if path.contains('\0') || !Path::new(path).is_absolute() {
        return Err(BackendError::new(
            "INVALID_PATH",
            "An absolute local path is required",
        ));
    }
    Ok(tokio::fs::canonicalize(path).await?)
}

async fn perform(window: WebviewWindow, path: PathBuf, reveal: bool) -> BackendResult<ShellResult> {
    tauri::async_runtime::spawn_blocking(move || {
        if reveal {
            window.opener().reveal_item_in_dir(&path)
        } else {
            window
                .opener()
                .open_path(path.to_string_lossy().as_ref(), None::<&str>)
        }
        .map_err(|e| BackendError::new("OPEN_FAILED", e.to_string()))?;
        Ok(ShellResult {
            ok: true,
            path: path.to_string_lossy().into_owned(),
        })
    })
    .await
    .map_err(|e| BackendError::new("OPEN_FAILED", e.to_string()))?
}

#[tauri::command]
pub async fn shell_open_path(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<ShellResult> {
    let path = absolute_path(&request.path).await?;
    perform(window, path, false).await
}

#[tauri::command]
pub async fn shell_reveal_path(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<ShellResult> {
    let path = absolute_path(&request.path).await?;
    perform(window, path, true).await
}

async fn workspace_path(window: &WebviewWindow, path: String) -> BackendResult<PathBuf> {
    let workspace = window.state::<WorkspaceRegistry>().get(window.label())?;
    tauri::async_runtime::spawn_blocking(move || workspace.resolve(&path))
        .await
        .map_err(|e| BackendError::new("PATH_FAILED", e.to_string()))?
}

#[tauri::command]
pub async fn workspace_open_path_in_system(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<ShellResult> {
    let path = workspace_path(&window, request.path).await?;
    perform(window, path, false).await
}

#[tauri::command]
pub async fn fs_open_path_in_system(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<ShellResult> {
    workspace_open_path_in_system(window, request).await
}

#[tauri::command]
pub async fn workspace_reveal_path_in_system(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<ShellResult> {
    let path = workspace_path(&window, request.path).await?;
    perform(window, path, true).await
}

#[tauri::command]
pub async fn workspace_copy_absolute_path(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<ShellResult> {
    let path = workspace_path(&window, request.path).await?;
    tauri::async_runtime::spawn_blocking(move || {
        window
            .clipboard()
            .write_text(path.to_string_lossy().as_ref())
            .map_err(|e| BackendError::new("CLIPBOARD_FAILED", e.to_string()))?;
        Ok(ShellResult {
            ok: true,
            path: path.to_string_lossy().into_owned(),
        })
    })
    .await
    .map_err(|e| BackendError::new("CLIPBOARD_FAILED", e.to_string()))?
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewRequest {
    path: String,
    limit_bytes: usize,
}
#[derive(Serialize)]
pub struct Preview {
    content: String,
    truncated: bool,
}

#[tauri::command]
pub async fn workspace_read_text_preview(
    window: WebviewWindow,
    request: PreviewRequest,
) -> BackendResult<Preview> {
    if !(1..=1024 * 1024).contains(&request.limit_bytes) {
        return Err(BackendError::new(
            "INVALID_REQUEST",
            "Preview size must be from 1 through 1048576 bytes",
        ));
    }
    let workspace = window.state::<WorkspaceRegistry>().get(window.label())?;
    let path = tauri::async_runtime::spawn_blocking(move || {
        crate::workspace::safe_asset_path(&workspace, &request.path)
    })
    .await
    .map_err(|e| BackendError::new("PATH_FAILED", e.to_string()))??;
    let file = tokio::fs::File::open(path).await?;
    let mut bytes = Vec::with_capacity(request.limit_bytes + 1);
    file.take(request.limit_bytes as u64 + 1)
        .read_to_end(&mut bytes)
        .await?;
    let truncated = bytes.len() > request.limit_bytes;
    bytes.truncate(request.limit_bytes);
    if truncated
        && let Err(error) = std::str::from_utf8(&bytes)
        && error.error_len().is_none()
    {
        bytes.truncate(error.valid_up_to());
    }
    Ok(Preview {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        truncated,
    })
}
