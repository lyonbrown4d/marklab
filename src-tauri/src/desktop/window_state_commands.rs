use crate::{error::BackendResult, native_window::TrustedWindow, workspace::types::EmptyRequest};
use serde::Deserialize;
#[cfg(target_os = "linux")]
use tauri::Manager;

#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct MaximizedRequest {
  maximized: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn window_get_maximized(
  window: TrustedWindow,
  request: EmptyRequest,
) -> BackendResult<bool> {
  let _ = request;
  read_maximized(&window).await
}

pub(super) async fn read_maximized(window: &tauri::WebviewWindow) -> BackendResult<bool> {
  #[cfg(target_os = "linux")]
  if let Some(maximized) = window
    .state::<super::hyprland_windows::HyprlandWindows>()
    .get(window)
    .await?
  {
    return Ok(maximized);
  }
  Ok(window.is_maximized()?)
}

#[tauri::command]
#[specta::specta]
pub async fn window_set_maximized(
  window: TrustedWindow,
  request: MaximizedRequest,
) -> BackendResult<()> {
  set_maximized(&window, request.maximized).await
}

pub(super) async fn set_maximized(
  window: &tauri::WebviewWindow,
  maximized: bool,
) -> BackendResult<()> {
  #[cfg(target_os = "linux")]
  if window
    .state::<super::hyprland_windows::HyprlandWindows>()
    .set(window, maximized)
    .await?
  {
    return Ok(());
  }
  if maximized {
    window.maximize()?;
  } else {
    window.unmaximize()?;
  }
  Ok(())
}
