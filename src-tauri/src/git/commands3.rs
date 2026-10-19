use super::cache::{Query, Value};
use super::{GitState, conflict, process, remote, safety, types::*};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn git_conflict(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: PathRequest,
) -> BackendResult<conflict::ConflictPreview> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state.query(&root, Query::Conflict(request.path)).await?;
  let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  if current != root {
    return Err(process::error(
      "git_workspace_boundary",
      "Workspace changed while waiting for Git",
    ));
  }
  match value.as_ref() {
    Value::Conflict(value) => Ok(value.clone()),
    _ => Err(process::error(
      "git_cache_type_error",
      "Git query returned an incompatible result",
    )),
  }
}
#[tauri::command]
pub async fn git_conflict_save(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: ConflictSaveRequest,
) -> BackendResult<conflict::SaveResult> {
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
  let result = async { conflict::save(&root, &request).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
#[tauri::command]
pub async fn git_commit_files(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: RevisionRequest,
) -> BackendResult<Vec<CommitFile>> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state
    .query(&root, Query::CommitFiles(request.commit))
    .await?;
  let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  if current != root {
    return Err(process::error(
      "git_workspace_boundary",
      "Workspace changed while waiting for Git",
    ));
  }
  match value.as_ref() {
    Value::CommitFiles(value) => Ok(value.clone()),
    _ => Err(process::error(
      "git_cache_type_error",
      "Git query returned an incompatible result",
    )),
  }
}
#[tauri::command]
pub async fn git_commit_diff(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: CommitDiffRequest,
) -> BackendResult<FileDiff> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state
    .query(
      &root,
      Query::CommitDiff {
        commit: request.commit,
        path: request.path,
        old_path: request.old_path,
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
pub async fn git_remote_status(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, GitState>,
  request: Scope,
) -> BackendResult<RemoteStatus> {
  let expected_root = request.expected_root.clone();
  let root = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  let value = state.query(&root, Query::Remote).await?;
  let current = safety::workspace_root(&window, &registry, expected_root.as_deref())?;
  if current != root {
    return Err(process::error(
      "git_workspace_boundary",
      "Workspace changed while waiting for Git",
    ));
  }
  match value.as_ref() {
    Value::Remote(value) => Ok(value.clone()),
    _ => Err(process::error(
      "git_cache_type_error",
      "Git query returned an incompatible result",
    )),
  }
}
#[tauri::command]
pub async fn git_remote_set(
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
  let result = async { remote::configure(&root, &request, false).await }.await;
  workspace.refresh_buffers_from_disk().await?;
  workspace.invalidate(window.app_handle())?;
  result
}
