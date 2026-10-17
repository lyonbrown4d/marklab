use super::{Workspace, WorkspaceRegistry, types::*};
use crate::error::{BackendError, BackendResult};
use crate::native_window::TrustedWindow as WebviewWindow;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

pub(super) async fn announce(window: &WebviewWindow, workspace: &Workspace) -> BackendResult<()> {
    workspace.invalidate(window.app_handle())
}

async fn change_root(
    window: &WebviewWindow,
    registry: &WorkspaceRegistry,
    path: Option<&str>,
    single: bool,
) -> BackendResult<RootInfo> {
    let _lifecycle = crate::desktop::lifecycle_guard(window.app_handle()).await;
    let previous = registry.get(window.label())?;
    let next = registry.open_async(window.label(), path, single).await?;
    let followup: BackendResult<()> = async {
        window.emit_to(
            tauri::EventTarget::webview_window(window.label()),
            "workspace-generation-changed",
            serde_json::json!({"generation":next.generation}),
        )?;
        if previous.generation != next.generation {
            crate::desktop::reset_workspace_runtime(window).await?;
        }
        registry
            .start_watcher(window.label(), window.app_handle().clone())
            .await?;
        crate::desktop::windows::activate_workspace_geometry(window, &next.root_info()).await?;
        announce(window, &next).await
    }
    .await;
    if let Err(error) = followup {
        // Root replacement is already committed. Never leave the old editor
        // visible against the new filesystem when a follow-up operation fails.
        crate::desktop::fail_workspace_transition(window, &error).await?;
        return Err(error);
    }
    Ok(next.root_info())
}

#[tauri::command]
pub fn fs_get_root_info(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: EmptyRequest,
) -> BackendResult<RootInfo> {
    let _ = request;
    Ok(registry.get(window.label())?.root_info())
}
#[tauri::command]
pub async fn fs_get_snapshot(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: EmptyRequest,
) -> BackendResult<Snapshot> {
    let _ = request;
    registry.get(window.label())?.snapshot().await
}
#[tauri::command]
pub async fn fs_list_entries(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: EmptyRequest,
) -> BackendResult<Vec<Entry>> {
    let _ = request;
    Ok(registry.get(window.label())?.snapshot().await?.entries)
}
#[tauri::command]
pub async fn fs_set_root(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: RootRequest,
) -> BackendResult<RootInfo> {
    change_root(&window, &registry, request.path.as_deref(), false).await
}
#[tauri::command]
pub async fn fs_set_single_file(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<RootInfo> {
    change_root(&window, &registry, Some(&request.path), true).await
}
pub use super::buffer_commands::*;

#[derive(Serialize)]
pub struct PathMetadata {
    path: String,
    kind: String,
    size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_ms: Option<u64>,
    readonly: bool,
}
#[tauri::command]
pub async fn fs_get_path_metadata(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<PathMetadata> {
    let path = registry
        .get(window.label())?
        .resolve_async(&request.path)
        .await?;
    let m = tokio::fs::metadata(path).await?;
    Ok(PathMetadata {
        path: request.path,
        kind: if m.is_dir() {
            "folder".into()
        } else {
            "file".into()
        },
        size_bytes: m.len(),
        modified_ms: m
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64),
        readonly: m.permissions().readonly(),
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateRequest {
    path: String,
    content: Option<String>,
}
#[tauri::command]
pub async fn fs_create_file(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: CreateRequest,
) -> BackendResult<()> {
    use tokio::io::AsyncWriteExt;
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    let _commits = workspace.commit_gate.lock().await;
    if request
        .content
        .as_ref()
        .is_some_and(|content| content.len() > super::patches::MAX_DOCUMENT_BYTES)
    {
        return Err(BackendError::new(
            "FILE_TOO_LARGE",
            "Document exceeds text editor limit",
        ));
    }
    let path = workspace.resolve_async(&request.path).await?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await?;
    file.write_all(request.content.unwrap_or_default().as_bytes())
        .await?;
    file.sync_all().await?;
    announce(&window, &workspace).await
}
#[tauri::command]
pub async fn fs_create_dir(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<()> {
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    let _commits = workspace.commit_gate.lock().await;
    tokio::fs::create_dir_all(workspace.resolve_async(&request.path).await?).await?;
    announce(&window, &workspace).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveRequest {
    pub(super) from: String,
    pub(super) to: String,
}
#[tauri::command]
pub async fn fs_rename_path(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: MoveRequest,
) -> BackendResult<()> {
    let workspace = registry.get(window.label())?;
    super::operations::move_path(window, workspace, request).await
}
#[tauri::command]
pub async fn fs_move_path(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: MoveRequest,
) -> BackendResult<()> {
    let workspace = registry.get(window.label())?;
    super::operations::move_path(window, workspace, request).await
}
#[tauri::command]
pub async fn fs_delete_path(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<()> {
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    workspace.flush_buffers_under_lock().await?;
    let _commits = workspace.commit_gate.lock().await;
    let path = workspace.resolve_async(&request.path).await?;
    crate::blocking::run(move || {
        trash::delete(path).map_err(|e| BackendError::new("DELETE_FAILED", e.to_string()))
    })
    .await?;
    let prefix = format!("{}/", request.path);
    workspace
        .buffers
        .lock()
        .await
        .retain(|p, _| p != &request.path && !p.starts_with(&prefix));
    announce(&window, &workspace).await
}

#[cfg(test)]
mod tests {
    use super::PathMetadata;

    #[test]
    fn metadata_omits_missing_time_and_preserves_valid_milliseconds() {
        let mut metadata = PathMetadata {
            path: "preview.pdf".into(),
            kind: "file".into(),
            size_bytes: 42,
            modified_ms: None,
            readonly: false,
        };
        let expected = serde_json::json!({
            "path": "preview.pdf", "kind": "file", "size_bytes": 42, "readonly": false,
        });
        assert_eq!(serde_json::to_value(&metadata).unwrap(), expected);
        metadata.modified_ms = Some(1_700_000_000_123);
        let value = serde_json::to_value(&metadata).unwrap();
        assert_eq!(value["modified_ms"], 1_700_000_000_123u64);
        assert_eq!(value["path"], "preview.pdf");
    }
}
