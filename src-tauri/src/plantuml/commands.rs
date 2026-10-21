use super::{ENGINE_VERSION, PlantUmlService, RenderRequest};
use crate::{
  assets::{AssetCapability, AssetService},
  error::BackendResult,
  native_window::TrustedWindow,
  workspace::WorkspaceRegistry,
};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderResult {
  pages: Vec<AssetCapability>,
  warnings: Vec<String>,
  engine_version: &'static str,
}
pub use PlantumlCancelRequest as CancelRequest;

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlantumlCancelRequest {
  request_id: String,
}

#[tauri::command]
#[specta::specta]
pub async fn plantuml_render(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  service: State<'_, PlantUmlService>,
  request: RenderRequest,
) -> BackendResult<RenderResult> {
  let workspace = registry.get(window.label())?;
  let diagram = service
    .render(window.label(), workspace.generation, request)
    .await?;
  let _binding = registry.lock_binding(window.label(), &workspace).await?;
  crate::blocking::run(move || {
    let assets = window.state::<AssetService>();
    let pages = diagram
      .pages
      .iter()
      .map(|svg| {
        assets.issue_bytes(
          window.label(),
          svg.as_bytes(),
          "plantuml.svg",
          "image/svg+xml",
        )
      })
      .collect::<BackendResult<Vec<_>>>()?;
    Ok(RenderResult {
      pages,
      warnings: diagram.warnings.clone(),
      engine_version: ENGINE_VERSION,
    })
  })
  .await
}

#[tauri::command]
#[specta::specta]
pub async fn plantuml_cancel(
  window: TrustedWindow,
  service: State<'_, PlantUmlService>,
  request: CancelRequest,
) -> BackendResult<()> {
  service.cancel(window.label(), &request.request_id)
}
