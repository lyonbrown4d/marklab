use super::{EmptyRequest, WorkspaceRegistry};
use crate::{analysis::AnalysisService, error::BackendResult, native_window::TrustedWindow};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::State;
#[derive(Serialize, specta::Type)]
pub struct BackgroundTask {
  id: &'static str,
  label: &'static str,
  status: BackgroundTaskStatus,
  message: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn fs_get_background_tasks(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<Vec<BackgroundTask>> {
  let _ = request;
  let workspace = registry.get(window.label())?;
  workspace.ensure_active()?;
  let error = workspace
    .save_error
    .lock()
    .ok()
    .and_then(|error| error.clone());
  let dirty = workspace
    .buffers
    .lock()
    .await
    .values()
    .filter(|buffer| buffer.dirty)
    .count();
  let saving = workspace.saving.load(Ordering::Acquire);
  let watching = workspace
    .watcher
    .lock()
    .map(|watcher| watcher.is_some())
    .unwrap_or(false);
  Ok(vec![
    BackgroundTask {
      id: "search-index",
      label: "Search index",
      status: if analysis.is_indexing(workspace.generation) {
        BackgroundTaskStatus::Running
      } else {
        BackgroundTaskStatus::Idle
      },
      message: None,
    },
    BackgroundTask {
      id: "buffer-flush",
      label: "Save queue",
      status: if saving {
        BackgroundTaskStatus::Running
      } else if error.is_some() {
        BackgroundTaskStatus::Error
      } else if dirty > 0 {
        BackgroundTaskStatus::Running
      } else {
        BackgroundTaskStatus::Idle
      },
      message: error.or_else(|| (dirty > 0).then(|| format!("{dirty} unsaved documents"))),
    },
    BackgroundTask {
      id: "watcher",
      label: "Workspace watcher",
      status: if workspace.watcher_busy.load(Ordering::Acquire) {
        BackgroundTaskStatus::Running
      } else {
        BackgroundTaskStatus::Idle
      },
      message: (!watching).then(|| "Workspace watcher is not active".into()),
    },
  ])
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum BackgroundTaskStatus {
  Running,
  Idle,
  Error,
}
