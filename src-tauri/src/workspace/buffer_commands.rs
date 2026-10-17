use super::commands::announce;
use super::{WorkspaceRegistry, types::*};
use crate::{error::BackendResult, native_window::TrustedWindow as WebviewWindow};
use tauri::{Manager, State};

#[tauri::command]
pub async fn fs_open_file(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<String> {
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    workspace.open_file_under_lock(&request.path).await
}
#[tauri::command]
pub async fn fs_read_file(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<String> {
    registry.get(window.label())?.read_file(&request.path).await
}
#[tauri::command]
pub async fn fs_write_file(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: WriteRequest,
) -> BackendResult<()> {
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    workspace
        .write_file_under_lock(&request.path, &request.content)
        .await?;
    workspace.clone().schedule_save(window.app_handle().clone());
    announce(&window, &workspace).await
}
#[tauri::command]
pub async fn fs_apply_buffer_update(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: UpdateRequest,
) -> BackendResult<UpdateResult> {
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    let result = workspace.apply_update_under_lock(request).await?;
    if let UpdateResult::Applied {
        path,
        revision,
        dirty,
        session_generation,
    } = &result
    {
        workspace.emit(
            window.app_handle(),
            "fs-buffer-status",
            BufferStatus {
                path: path.clone(),
                revision: *revision,
                dirty: *dirty,
                session_generation: *session_generation,
            },
        )?;
        workspace.clone().schedule_save(window.app_handle().clone());
        announce(&window, &workspace).await?;
    }
    Ok(result)
}
#[tauri::command]
pub async fn fs_get_buffer_status(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<Option<BufferStatus>> {
    registry
        .get(window.label())?
        .buffer_status(&request.path)
        .await
}
#[tauri::command]
pub async fn fs_flush_buffers(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: EmptyRequest,
) -> BackendResult<u32> {
    let _ = request;
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    let dirty: Vec<_> = workspace
        .buffers
        .lock()
        .await
        .iter()
        .filter(|(_, b)| b.dirty)
        .map(|(p, _)| p.clone())
        .collect();
    let count = workspace.flush_buffers_under_lock().await?;
    for path in dirty {
        if let Some(status) = workspace.buffer_status(&path).await? {
            workspace.emit(window.app_handle(), "fs-buffer-status", status)?;
        }
    }
    if count > 0 {
        announce(&window, &workspace).await?;
    }
    Ok(count)
}

#[derive(serde::Serialize)]
pub struct BufferSnapshot {
    content: String,
    #[serde(flatten)]
    status: BufferStatus,
}

#[tauri::command]
pub async fn fs_open_buffer_snapshot(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    request: PathRequest,
) -> BackendResult<BufferSnapshot> {
    let workspace = registry.get(window.label())?;
    let _mutation = registry.lock_binding(window.label(), &workspace).await?;
    let content = workspace.open_file_under_lock(&request.path).await?;
    let status = workspace
        .buffer_status(&request.path)
        .await?
        .ok_or_else(|| crate::error::BackendError::new("STALE_SESSION", "Buffer is unavailable"))?;
    Ok(BufferSnapshot { content, status })
}
