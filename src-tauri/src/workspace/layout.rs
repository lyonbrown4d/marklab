use super::{Workspace, WorkspaceRegistry, layout_types::*, layout_validation};
use crate::{
  error::{BackendError, BackendResult},
  native_window::TrustedWindow,
  settings::SettingsStore,
};
use sqlx::types::Json;
use std::{collections::HashSet, sync::Arc};
use tauri::State;

fn current_key(workspace: &Workspace, requested: &str) -> BackendResult<String> {
  let root = workspace.root_info();
  if requested.len() > 8192 || requested != format!("{}:{}", root.kind.as_str(), root.path) {
    return Err(BackendError::new(
      "WORKSPACE_MISMATCH",
      "Layout workspace must match this window's current workspace",
    ));
  }
  crate::database::workspace_key(root.kind.as_str(), &root.path)
}

impl SettingsStore {
  pub(crate) async fn get_workspace_layout(
    &self,
    registry: &WorkspaceRegistry,
    label: &str,
    requested: &str,
  ) -> BackendResult<WorkspaceLayoutResult> {
    let workspace = registry.get(label)?;
    let _binding = registry.lock_binding(label, &workspace).await?;
    let key = current_key(&workspace, requested)?;
    let row: Option<(Json<WorkspaceLayout>, i64)> =
      sqlx::query_as("SELECT value_json,version FROM workspace_layouts WHERE workspace_key=?")
        .bind(key)
        .fetch_optional(&self.pool)
        .await
        .map_err(crate::settings::persisted_decode_error)?;
    let layout = if let Some((Json(mut layout), 1)) = row {
      layout_validation::validate(&layout)?;
      let checked = workspace.clone();
      layout = crate::blocking::run(move || {
        let keep = check_files(&checked, &layout, true)?;
        layout_validation::prune(&mut layout, &keep);
        Ok(layout)
      })
      .await?;
      Some(layout)
    } else {
      None
    };
    Ok(WorkspaceLayoutResult {
      layout,
      session_generation: registry.binding_generation(label)?,
    })
  }

  pub(crate) async fn set_workspace_layout(
    &self,
    registry: &WorkspaceRegistry,
    label: &str,
    request: SetWorkspaceLayoutRequest,
  ) -> BackendResult<WorkspaceLayoutSaved> {
    let workspace = registry.get(label)?;
    let _binding = registry.lock_binding(label, &workspace).await?;
    let key = current_key(&workspace, &request.workspace_key)?;
    if request.session_generation != registry.binding_generation(label)? {
      return Err(BackendError::new(
        "STALE_SESSION",
        "Layout belongs to an earlier workspace session",
      ));
    }
    layout_validation::validate(&request.layout)?;
    let checked = workspace.clone();
    let layout = crate::blocking::run(move || {
      check_files(&checked, &request.layout, false)?;
      Ok(request.layout)
    })
    .await?;
    // One atomic upsert, serialized with other settings writes. The bound key
    // never changes while awaiting SQLite, even when another window is active.
    let _mutation = self.mutation.lock().await;
    sqlx::query("INSERT INTO workspace_layouts(workspace_key,value_json,version) VALUES(?,?,1) ON CONFLICT(workspace_key) DO UPDATE SET value_json=excluded.value_json,version=excluded.version")
      .bind(key).bind(Json(&layout)).execute(&self.pool).await?;
    Ok(WorkspaceLayoutSaved { saved: true })
  }
}

fn check_files(
  workspace: &Arc<Workspace>,
  layout: &WorkspaceLayout,
  restoring: bool,
) -> BackendResult<HashSet<String>> {
  let mut keep = HashSet::new();
  for (id, panel) in &layout.panels {
    let route = &panel.params.tab.route;
    let Some(path) = layout_validation::route_path(route)? else {
      keep.insert(id.clone());
      continue;
    };
    match workspace.resolve(&path) {
      // A tracked deletion still has a valid Git diff even without a disk file.
      Ok(path) if !restoring || route.starts_with("/_diff/") || path.is_file() => {
        keep.insert(id.clone());
      }
      Ok(_) => {}
      Err(_) if restoring => {}
      Err(error) => return Err(error),
    }
  }
  Ok(keep)
}

#[tauri::command]
#[specta::specta]
pub async fn fs_get_workspace_layout(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, SettingsStore>,
  request: WorkspaceLayoutRequest,
) -> BackendResult<WorkspaceLayoutResult> {
  store
    .get_workspace_layout(&registry, window.label(), &request.workspace_key)
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn fs_set_workspace_layout(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  store: State<'_, SettingsStore>,
  request: SetWorkspaceLayoutRequest,
) -> BackendResult<WorkspaceLayoutSaved> {
  store
    .set_workspace_layout(&registry, window.label(), request)
    .await
}
