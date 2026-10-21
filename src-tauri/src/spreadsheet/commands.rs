use super::{ReadPageRequest, SpreadsheetPage, SpreadsheetService};
use crate::{
  assets::AssetService, error::BackendResult, native_window::TrustedWindow,
  workspace::WorkspaceRegistry,
};
use tauri::{Manager, State};

#[tauri::command]
#[specta::specta]
pub async fn spreadsheet_read_page(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  service: State<'_, SpreadsheetService>,
  request: ReadPageRequest,
) -> BackendResult<SpreadsheetPage> {
  super::limits::validate(&request)?;
  let workspace = registry.get(window.label())?;
  let owner = window.label().to_owned();
  let permits = service.permits().await?;
  let parsing_workspace = workspace.clone();
  let page = crate::blocking::run(move || {
    // Retain permits until parsing ends even when its caller is cancelled.
    let _permits = permits;
    let assets = window.state::<AssetService>();
    window
      .state::<SpreadsheetService>()
      .read(window.label(), &parsing_workspace, &assets, request)
  })
  .await?;
  // A shared workspace may stay active after this window changes roots.
  registry.ensure_binding(&owner, &workspace)?;
  Ok(page)
}
