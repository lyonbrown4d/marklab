use super::{UpdateResult, UpdateService, UpdateState};
use crate::{
    error::{BackendError, BackendResult},
    native_window::TrustedWindow,
    workspace::EmptyRequest,
};
use serde::Deserialize;
use tauri::{Manager, State};

#[tauri::command]
pub async fn updates_get_state(
    service: State<'_, UpdateService>,
    request: EmptyRequest,
) -> BackendResult<UpdateState> {
    let _ = request;
    Ok(service.state.lock().await.clone())
}
#[tauri::command]
pub async fn updates_check(
    window: TrustedWindow,
    service: State<'_, UpdateService>,
    request: EmptyRequest,
) -> BackendResult<UpdateResult> {
    let _ = request;
    service.check(window.app_handle()).await
}
#[tauri::command]
pub async fn updates_download(
    window: TrustedWindow,
    service: State<'_, UpdateService>,
    request: EmptyRequest,
) -> BackendResult<UpdateResult> {
    let _ = request;
    service.download(window.app_handle()).await
}
#[tauri::command]
pub async fn updates_install(
    window: TrustedWindow,
    service: State<'_, UpdateService>,
    request: EmptyRequest,
) -> BackendResult<UpdateResult> {
    let _ = request;
    service.install(window.app_handle(), true).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScheduleRequest {
    enabled: bool,
}
#[tauri::command]
pub async fn updates_set_install_on_quit(
    window: TrustedWindow,
    service: State<'_, UpdateService>,
    request: ScheduleRequest,
) -> BackendResult<UpdateResult> {
    let mut state = service.state.lock().await;
    if request.enabled && state.status != "downloaded" {
        return Err(BackendError::new(
            "NOT_READY",
            "Download an update before scheduling installation",
        ));
    }
    state.install_on_quit = request.enabled;
    drop(state);
    service
        .publish(window.app_handle(), "install-on-quit-changed")
        .await
}
