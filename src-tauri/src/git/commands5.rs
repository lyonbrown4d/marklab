use super::{GitState, local, process, safety, types::*};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn git_branch_switch(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: BranchRequest,
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
    let result = async { local::branch_action(&root, "switch", &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_branch_delete(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: BranchRequest,
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
    let result = async { local::branch_action(&root, "delete", &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_merge(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: BranchRequest,
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
    let result = async { local::branch_action(&root, "merge", &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_rebase(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: BranchRequest,
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
    let result = async { local::branch_action(&root, "rebase", &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_cherry_pick(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: RevisionRequest,
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
    let result = async { local::revision_action(&root, "cherry-pick", &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_revert(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: RevisionRequest,
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
    let result = async { local::revision_action(&root, "revert", &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
