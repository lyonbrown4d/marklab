use super::cache::{Query, Value};
use super::{GitState, local, process, safety, types::*};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn git_stage(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: PathsRequest,
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
  let result = async { local::paths(&root, "stage", &request).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_unstage(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: PathsRequest,
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
  let result = async { local::paths(&root, "unstage", &request).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_discard(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: PathsRequest,
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
  let result = async { local::paths(&root, "discard", &request).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_history(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: HistoryRequest,
) -> BackendResult<Vec<Commit>> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state
    .query(
      &root,
      Query::History {
        limit: request.limit,
        skip: request.skip,
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
    Value::History(value) => Ok(value.clone()),
    _ => Err(process::error(
      "git_cache_type_error",
      "Git query returned an incompatible result",
    )),
  }
}
#[tauri::command]
pub async fn git_branches(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: Scope,
) -> BackendResult<Vec<Branch>> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state.query(&root, Query::Branches).await?;
  let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  if current != root {
    return Err(process::error(
      "git_workspace_boundary",
      "Workspace changed while waiting for Git",
    ));
  }
  match value.as_ref() {
    Value::Branches(value) => Ok(value.clone()),
    _ => Err(process::error(
      "git_cache_type_error",
      "Git query returned an incompatible result",
    )),
  }
}
#[tauri::command]
pub async fn git_stashes(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: Scope,
) -> BackendResult<Vec<Stash>> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state.query(&root, Query::Stashes).await?;
  let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  if current != root {
    return Err(process::error(
      "git_workspace_boundary",
      "Workspace changed while waiting for Git",
    ));
  }
  match value.as_ref() {
    Value::Stashes(value) => Ok(value.clone()),
    _ => Err(process::error(
      "git_cache_type_error",
      "Git query returned an incompatible result",
    )),
  }
}
