use super::*;
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{error::BackendResult, settings::SettingsStore, workspace::WorkspaceRegistry};
use tauri::{Manager, State};
#[tauri::command]
pub async fn ai_list_providers(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: EmptyRequest,
) -> BackendResult<Vec<PublicProvider>> {
    let _ = request;
    registry.get(window.label())?;
    service.list_providers().await
}
#[tauri::command]
pub async fn ai_get_provider(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: IdRequest,
) -> BackendResult<PublicProvider> {
    registry.get(window.label())?;
    service.get_provider(&request.id).await
}
#[tauri::command]
pub async fn ai_update_provider(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: ProviderUpdate,
) -> BackendResult<PublicProvider> {
    registry.get(window.label())?;
    service.update_provider(request).await
}
#[tauri::command]
pub async fn ai_delete_provider(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: IdRequest,
) -> BackendResult<OkResult> {
    registry.get(window.label())?;
    service.delete_provider(&request.id).await?;
    Ok(OkResult { ok: true })
}
#[tauri::command]
pub async fn ai_test_provider(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: IdRequest,
) -> BackendResult<OkResult> {
    registry.get(window.label())?;
    service.test_provider(&request.id).await?;
    Ok(OkResult { ok: true })
}
#[tauri::command]
pub async fn ai_generate_text(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: GenerateRequest,
) -> BackendResult<GenerateResult> {
    registry.get(window.label())?;
    service.generate(request).await
}
#[tauri::command]
pub async fn ai_start_generation(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: GenerateRequest,
) -> BackendResult<StartResult> {
    let workspace = registry.get(window.label())?;
    let _lifecycle = crate::desktop::lifecycle_guard(window.app_handle()).await;
    registry.ensure_binding(window.label(), &workspace)?;
    service.start_generation(window, request, None).await
}
#[tauri::command]
pub async fn ai_cancel_generation(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: CancelRequest,
) -> BackendResult<OkResult> {
    registry.get(window.label())?;
    service.cancel(&window, &request.request_id).await?;
    Ok(OkResult { ok: true })
}
#[tauri::command]
pub async fn ai_completion_start(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    settings: State<'_, SettingsStore>,
    request: InlineRequest,
) -> BackendResult<StartResult> {
    let workspace = registry.get(window.label())?;
    let _lifecycle = crate::desktop::lifecycle_guard(window.app_handle()).await;
    registry.ensure_binding(window.label(), &workspace)?;
    service.start_inline(window, &settings, request).await
}
#[tauri::command]
pub async fn ai_completion_cancel(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, AiService>,
    request: CancelRequest,
) -> BackendResult<OkResult> {
    registry.get(window.label())?;
    service.cancel(&window, &request.request_id).await?;
    Ok(OkResult { ok: true })
}
