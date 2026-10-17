use super::{GitState, local, process, remote, safety, types::*};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn git_remote_remove(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: RemoteRequest,
) -> BackendResult<RemoteStatus> {
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
    let result = async { remote::configure(&root, &request, true).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_fetch(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: NetworkRequest,
) -> BackendResult<RemoteStatus> {
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
    let result = async { remote::network(&root, &request, "fetch").await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_pull(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: Scope,
) -> BackendResult<RemoteStatus> {
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
    let result = async {
        remote::network(
            &root,
            &NetworkRequest {
                expected_root: None,
                remote: None,
                set_upstream: None,
            },
            "pull",
        )
        .await
    }
    .await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_push(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: NetworkRequest,
) -> BackendResult<RemoteStatus> {
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
    let result = async { remote::network(&root, &request, "push").await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_reset(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    state: State<'_, GitState>,
    request: RevisionRequest,
) -> BackendResult<ResetResult> {
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
    let result = async { local::reset(&root, &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
#[tauri::command]
pub async fn git_branch_create(
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
    let result = async { local::branch_action(&root, "create", &request).await }.await;
    workspace.refresh_buffers_from_disk().await?;
    workspace.invalidate(window.app_handle())?;
    result
}
