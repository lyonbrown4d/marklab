use super::*;
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn local_history_list(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, HistoryStore>,
  request: PathRequest,
) -> BackendResult<Vec<HistoryEntry>> {
  store
    .list(&registry.get(window.label())?.root_info(), &request.path)
    .await
}
#[tauri::command]
pub async fn local_history_read(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, HistoryStore>,
  request: EntryRequest,
) -> BackendResult<HistorySnapshot> {
  store
    .read(
      &registry.get(window.label())?.root_info(),
      &request.path,
      &request.entry_id,
    )
    .await
}
#[tauri::command]
pub async fn local_history_restore(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, HistoryStore>,
  request: EntryRequest,
) -> BackendResult<HistorySnapshot> {
  let workspace = registry.get(window.label())?;
  let _mutation = workspace.mutation.lock().await;
  registry.ensure_binding(window.label(), &workspace)?;
  let previous_revision = workspace.current_revision();
  let result = store
    .restore_under_lock(&workspace, &request.path, &request.entry_id)
    .await;
  if let Ok(Some(status)) = workspace.buffer_status(&request.path).await {
    let _ = workspace.emit_to_owners(window.app_handle(), "fs-buffer-status", status);
  }
  let revision = workspace.current_revision();
  if revision != previous_revision && workspace.ensure_active().is_ok() {
    let payload = serde_json::json!({"kind":"invalidated","root":workspace.root_info(),"generation":workspace.generation,"previousRevision":previous_revision,"revision":revision});
    let _ = workspace.emit_to_owners(window.app_handle(), "fs-changed", &payload);
    let _ = workspace.emit_to_owners(window.app_handle(), "workspace-tree-changed", serde_json::json!({"kind":"invalidated","root":workspace.root_info(),"generation":workspace.generation,"previousRevision":previous_revision,"revision":revision}));
  }
  result
}
#[tauri::command]
pub async fn local_history_delete(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, HistoryStore>,
  request: EntryRequest,
) -> BackendResult<DeleteResult> {
  store
    .delete(
      &registry.get(window.label())?.root_info(),
      &request.path,
      &request.entry_id,
    )
    .await
}
#[tauri::command]
pub async fn local_history_clear(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, HistoryStore>,
  request: PathRequest,
) -> BackendResult<ClearResult> {
  store
    .clear(&registry.get(window.label())?.root_info(), &request.path)
    .await
}
