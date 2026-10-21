use crate::{
  database::workspace_key,
  error::BackendResult,
  graph_compute::{
    GraphCommunityRequest, GraphCommunityResult, GraphComputeService, GraphLayoutComputeRequest,
    GraphLayoutComputeResult,
  },
  native_window::TrustedWindow,
  workspace::WorkspaceRegistry,
};
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphComputationCancel {
  request_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn fs_compute_workspace_graph_layout(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  service: State<'_, GraphComputeService>,
  request: GraphLayoutComputeRequest,
) -> BackendResult<GraphLayoutComputeResult> {
  let root = registry.get(window.label())?.root_info();
  let workspace = workspace_key(root.kind.as_str(), &root.path)?;
  service
    .compute_layout(window.label(), &workspace, request)
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn fs_partition_workspace_graph(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  service: State<'_, GraphComputeService>,
  request: GraphCommunityRequest,
) -> BackendResult<GraphCommunityResult> {
  let root = registry.get(window.label())?.root_info();
  let workspace = workspace_key(root.kind.as_str(), &root.path)?;
  service
    .compute_communities(window.label(), &workspace, request)
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn fs_cancel_graph_computation(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  service: State<'_, GraphComputeService>,
  request: GraphComputationCancel,
) -> BackendResult<()> {
  registry.get(window.label())?;
  service.cancel(window.label(), &request.request_id)
}
