use super::{PersistResult, PersistedValue, RecentWorkspace, SettingsStore};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  error::{BackendError, BackendResult},
  workspace::WorkspaceRegistry,
};
use serde::Deserialize;
use serde_json::Value;
use tauri::{Emitter, Manager, State};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmptyRequest {}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyRequest {
  key: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetRequest {
  key: String,
  value: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PathRequest {
  path: String,
}

#[tauri::command]
pub async fn settings_persist_get(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, SettingsStore>,
  request: KeyRequest,
) -> BackendResult<Option<PersistedValue>> {
  registry.get(window.label())?;
  store.get(&request.key, window.label()).await
}
#[tauri::command]
pub async fn settings_persist_set(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, SettingsStore>,
  request: SetRequest,
) -> BackendResult<PersistResult> {
  let result = async {
    let workspace = registry.get(window.label())?;
    let _session = if request.key == super::types::WORKSPACE {
      Some(registry.lock_binding(window.label(), &workspace).await?)
    } else {
      None
    };
    if request.key == super::types::WORKSPACE
      && let Some(root) = request
        .value
        .get("state")
        .and_then(|state| state.get("rootPath"))
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
    {
      let info = workspace.root_info();
      let requested_kind = request
        .value
        .get("state")
        .and_then(|state| state.get("rootKind"))
        .and_then(Value::as_str)
        .unwrap_or("internal");
      if root != info.path || requested_kind != info.kind {
        return Err(BackendError::new(
          "workspace_mismatch",
          "Session root must match this window's workspace",
        ));
      }
    }
    store
      .set(&request.key, window.label(), request.value)
      .await?;
    if request.key == super::types::WORKSPACE {
      let _ = window.app_handle().emit("recent-workspaces-changed", ());
    }
    Ok(())
  }
  .await;
  Ok(PersistResult::from_result(result))
}
#[tauri::command]
pub async fn settings_persist_remove(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, SettingsStore>,
  request: KeyRequest,
) -> BackendResult<PersistResult> {
  Ok(PersistResult::from_result(
    async {
      let workspace = registry.get(window.label())?;
      let _session = if request.key == super::types::WORKSPACE {
        Some(registry.lock_binding(window.label(), &workspace).await?)
      } else {
        None
      };
      store.remove(&request.key, window.label()).await
    }
    .await,
  ))
}
#[tauri::command]
pub async fn recent_workspaces_list(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, SettingsStore>,
  request: EmptyRequest,
) -> BackendResult<Vec<RecentWorkspace>> {
  let _ = request;
  registry.get(window.label())?;
  store.list_recent_workspaces().await
}
#[tauri::command]
pub async fn recent_workspaces_remove(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, SettingsStore>,
  request: PathRequest,
) -> BackendResult<PersistResult> {
  Ok(PersistResult::from_result(
    async {
      registry.get(window.label())?;
      store.remove_recent_workspace(&request.path).await?;
      let _ = window.app_handle().emit("recent-workspaces-changed", ());
      Ok(())
    }
    .await,
  ))
}
