use super::cache::{Query, Value};
use super::{GitState, local, process, safety, types::*};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn git_stash_save(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: StashSaveRequest,
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
  let result = async { local::stash_save(&root, &request).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_stash_apply(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: StashRequest,
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
  let result = async { local::stash_action(&root, &request, false).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_stash_drop(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: StashRequest,
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
  let result = async { local::stash_action(&root, &request, true).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_operation_state(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: Scope,
) -> BackendResult<Operation> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state.query(&root, Query::Operation).await?;
  let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  if current != root {
    return Err(process::error(
      "git_workspace_boundary",
      "Workspace changed while waiting for Git",
    ));
  }
  match value.as_ref() {
    Value::Operation(value) => Ok(value.clone()),
    _ => Err(process::error(
      "git_cache_type_error",
      "Git query returned an incompatible result",
    )),
  }
}
#[tauri::command]
pub async fn git_operation_continue(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: Scope,
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
  let result = async { local::sequence(&root, false).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_operation_abort(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: Scope,
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
  let result = async { local::sequence(&root, true).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
