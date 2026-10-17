use super::cache::{Query, Value};
use super::{GitState, local, process, safety, status, types::*};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn git_discover(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: Scope,
) -> BackendResult<RepoInfo> {
    let expected_root = request.expected_root.clone();
    let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
    let value = state.query(&root, Query::Repository).await?;
    let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
    if current != root {
        return Err(process::error(
            "git_workspace_boundary",
            "Workspace changed while waiting for Git",
        ));
    }
    match value.as_ref() {
        Value::Repository(value) => Ok(value.clone()),
        _ => Err(process::error(
            "git_cache_type_error",
            "Git query returned an incompatible result",
        )),
    }
}
#[tauri::command]
pub async fn git_init(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: Scope,
) -> BackendResult<RepoInfo> {
    let root = safety::workspace_root(&window, &registry, request.expected_root.as_deref())?;
    let workspace = registry.get(window.label())?;
    let lock = state.lock(&root).await;
    let _guard = lock.lock().await;
    let _workspace_guard = workspace.mutation.lock().await;
    registry.ensure_binding(window.label(), &workspace)?;
    let _cache_invalidation = state.invalidation(&root);
    workspace.flush_buffers_under_lock().await?;
    let _commits = workspace.commit_gate.lock().await;
    let current = safety::workspace_root(&window, &registry, request.expected_root.as_deref())?;
    if current != root {
        return Err(process::error(
            "git_workspace_boundary",
            "Workspace changed while waiting for Git",
        ));
    }
    let result = async {
        if !safety::repository(&root, true).await? {
            process::init(&root).await?;
        }
        status::repo(&root).await
    }
    .await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_status(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: Scope,
) -> BackendResult<Status> {
    let expected_root = request.expected_root.clone();
    let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
    let value = state.query(&root, Query::Status).await?;
    let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
    if current != root {
        return Err(process::error(
            "git_workspace_boundary",
            "Workspace changed while waiting for Git",
        ));
    }
    match value.as_ref() {
        Value::Status(value) => Ok(value.clone()),
        _ => Err(process::error(
            "git_cache_type_error",
            "Git query returned an incompatible result",
        )),
    }
}
#[tauri::command]
pub async fn git_file_diff(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: DiffRequest,
) -> BackendResult<FileDiff> {
    let expected_root = request.expected_root.clone();
    let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
    let value = state
        .query(
            &root,
            Query::FileDiff {
                path: request.path,
                section: request.section,
            },
        )
        .await?;
    let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
    if current != root {
        return Err(process::error(
            "git_workspace_boundary",
            "Workspace changed while waiting for Git",
        ));
    }
    match value.as_ref() {
        Value::Diff(value) => Ok(value.clone()),
        _ => Err(process::error(
            "git_cache_type_error",
            "Git query returned an incompatible result",
        )),
    }
}
#[tauri::command]
pub async fn git_commit_all(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: MessageRequest,
) -> BackendResult<Status> {
    let root = safety::workspace_root(&window, &registry, request.expected_root.as_deref())?;
    let workspace = registry.get(window.label())?;
    let lock = state.lock(&root).await;
    let _guard = lock.lock().await;
    let _workspace_guard = workspace.mutation.lock().await;
    registry.ensure_binding(window.label(), &workspace)?;
    let _cache_invalidation = state.invalidation(&root);
    workspace.flush_buffers_under_lock().await?;
    let _commits = workspace.commit_gate.lock().await;
    let current = safety::workspace_root(&window, &registry, request.expected_root.as_deref())?;
    if current != root {
        return Err(process::error(
            "git_workspace_boundary",
            "Workspace changed while waiting for Git",
        ));
    }
    safety::repository(&root, false).await?;
    let result = async { local::commit(&root, &request.message, true).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_commit_staged(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: MessageRequest,
) -> BackendResult<Status> {
    let root = safety::workspace_root(&window, &registry, request.expected_root.as_deref())?;
    let workspace = registry.get(window.label())?;
    let lock = state.lock(&root).await;
    let _guard = lock.lock().await;
    let _workspace_guard = workspace.mutation.lock().await;
    registry.ensure_binding(window.label(), &workspace)?;
    let _cache_invalidation = state.invalidation(&root);
    workspace.flush_buffers_under_lock().await?;
    let _commits = workspace.commit_gate.lock().await;
    let current = safety::workspace_root(&window, &registry, request.expected_root.as_deref())?;
    if current != root {
        return Err(process::error(
            "git_workspace_boundary",
            "Workspace changed while waiting for Git",
        ));
    }
    safety::repository(&root, false).await?;
    let result = async { local::commit(&root, &request.message, false).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
