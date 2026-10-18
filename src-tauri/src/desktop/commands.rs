pub use super::controls::*;
use crate::{
    error::{BackendError, BackendResult},
    native_window::TrustedWindow as WebviewWindow,
    workspace::{
        WorkspaceRegistry,
        types::{EmptyRequest, PathRequest},
    },
};
use serde::{Deserialize, Serialize};

use tauri::{Emitter, Manager};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadyRequest {
    phase: String,
    error: Option<String>,
    attempt: Option<u64>,
}
#[tauri::command]
pub async fn app_ready(window: WebviewWindow, request: ReadyRequest) -> BackendResult<OkResult> {
    if !["shell", "workspace-interactive", "workspace-error"].contains(&request.phase.as_str()) {
        return Err(BackendError::new(
            "INVALID_REQUEST",
            "Invalid renderer phase",
        ));
    }
    let _lifecycle = super::lifecycle_guard(window.app_handle()).await;
    super::startup::ready(&window, &request.phase, request.error, request.attempt).await?;
    window.emit_to(tauri::EventTarget::webview_window(window.label()), "system-theme-changed",serde_json::json!({"colorMode":if window.theme()?==tauri::Theme::Dark{"dark"}else{"light"}}))?;
    Ok(OkResult::success())
}
#[tauri::command]
pub async fn workspace_session_seed(
    window: WebviewWindow,
    request: EmptyRequest,
) -> BackendResult<super::startup::SessionSeed> {
    let _ = request;
    let app = window.app_handle();
    let owner = app
        .state::<super::startup::StartupState>()
        .owner(window.label());
    let Some(registry) = app.try_state::<WorkspaceRegistry>() else {
        return super::startup::seed(app, &owner, crate::settings::PersistedValue::default());
    };
    let workspace = match registry.get(&owner) {
        Ok(workspace) => workspace,
        Err(_) if window.label().starts_with("opening-") => {
            return super::startup::seed(app, &owner, crate::settings::PersistedValue::default());
        }
        Err(error) => return Err(error),
    };
    let root = workspace.root_info();
    let mut seed = app
        .state::<crate::settings::SettingsStore>()
        .read_session(&owner)
        .await?
        .unwrap_or_default();
    let same = seed.state.get("rootPath").and_then(|value| value.as_str())
        == Some(root.path.as_str())
        && seed.state.get("rootKind").and_then(|value| value.as_str()) == Some(root.kind.as_str());
    if !same {
        seed.state.insert("tabs".into(), serde_json::json!([]));
        seed.state
            .insert("activeTabId".into(), serde_json::Value::Null);
    }
    seed.state.insert("rootPath".into(), root.path.into());
    seed.state.insert("rootKind".into(), root.kind.into());
    super::startup::seed(app, &owner, seed)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowOpenResult {
    ok: bool,
    shared_workspace_session: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    root_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}
fn open_result(
    app: &tauri::AppHandle,
    result: BackendResult<String>,
    shared: bool,
) -> BackendResult<WindowOpenResult> {
    match result {
        Ok(label) => {
            let root = app.state::<WorkspaceRegistry>().get(&label)?.root_info();
            Ok(WindowOpenResult {
                ok: true,
                shared_workspace_session: shared,
                workspace_path: Some(root.path),
                root_kind: Some(root.kind),
                error: None,
            })
        }
        Err(error) => Ok(WindowOpenResult {
            ok: false,
            shared_workspace_session: false,
            workspace_path: None,
            root_kind: None,
            error: Some(error.message),
        }),
    }
}
#[tauri::command]
pub async fn open_path_in_new_window(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<WindowOpenResult> {
    let result = super::windows::open_target(window.app_handle(), &request.path, None).await;
    open_result(window.app_handle(), result, false)
}
#[tauri::command]
pub async fn open_path_in_current_window(
    window: WebviewWindow,
    request: PathRequest,
) -> BackendResult<WindowOpenResult> {
    let result =
        super::windows::open_target(window.app_handle(), &request.path, Some(window.label())).await;
    open_result(window.app_handle(), result, false)
}
#[tauri::command]
pub async fn open_current_workspace_in_new_window(
    window: WebviewWindow,
    request: EmptyRequest,
) -> BackendResult<WindowOpenResult> {
    let _ = request;
    super::lifecycle::request_renderer_flush(&window).await?;
    let workspace = window.state::<WorkspaceRegistry>().get(window.label())?;
    let root = workspace.root_info();
    let mut seed = window
        .state::<crate::settings::SettingsStore>()
        .read_session(window.label())
        .await?
        .unwrap_or_default();
    seed.state.insert("rootPath".into(), root.path.into());
    seed.state.insert("rootKind".into(), root.kind.into());
    let result = super::windows::restore_window(window.app_handle(), seed).await;
    open_result(window.app_handle(), result, true)
}
#[tauri::command]
pub async fn retry_window_open(
    window: WebviewWindow,
    request: EmptyRequest,
) -> BackendResult<OkResult> {
    let _ = request;
    let app = window.app_handle();
    let state = app.state::<super::startup::StartupState>();
    let owner = state.owner(window.label());
    let Some(boot) = state.boot(&owner)? else {
        return Ok(OkResult {
            ok: false,
            error: Some("No failed workspace open is available to retry".into()),
        });
    };
    if boot.phase != super::policy::Phase::Failed {
        return Ok(OkResult {
            ok: false,
            error: Some("This workspace is already opening or interactive".into()),
        });
    }
    if app.try_state::<crate::database::Database>().is_none() {
        super::bootstrap::start(app);
        return Ok(OkResult::success());
    }
    let attempt = state.begin(&owner, boot.target.clone())?;
    if let Some(main) = crate::native_window::get(app, &owner) {
        main.reload()?;
        super::startup::emit_progress(app, &owner);
        super::startup::schedule_timeout(app, &owner, attempt);
    } else if let Some(path) = boot.target {
        app.state::<WorkspaceRegistry>().allow_open(&owner)?;
        if let Err(error) = super::windows::open_target(app, &path, Some(&owner)).await {
            return Ok(OkResult {
                ok: false,
                error: Some(error.message),
            });
        }
    } else {
        app.state::<WorkspaceRegistry>().allow_open(&owner)?;
        super::windows::bind(app, &owner, None, false).await?;
        let locale = app
            .state::<crate::settings::SettingsStore>()
            .read_setting("marklab.preferences")
            .await?
            .and_then(|value| {
                value
                    .state
                    .get("locale")
                    .and_then(serde_json::Value::as_str)
                    .map(String::from)
            })
            .unwrap_or_else(|| "en-US".into());
        super::bootstrap::seed_internal(app, &locale).await?;
        super::windows::create(app, &owner, None).await?;
    }
    Ok(OkResult::success())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MenuRequest {
    id: String,
}
#[tauri::command]
pub async fn menu_dispatch(window: WebviewWindow, request: MenuRequest) -> BackendResult<OkResult> {
    if !super::menus::valid_action(&request.id) {
        return Err(BackendError::new(
            "INVALID_MENU_ACTION",
            "Unsupported menu action",
        ));
    }
    match request.id.as_str() {
        "edit.undo" | "edit.redo" | "edit.cut" | "edit.copy" | "edit.paste" | "edit.select_all" => {
            super::native_edit::dispatch_menu(&window, &request.id).await?
        }
        "app.quit" => super::lifecycle::request_quit(window.app_handle())?,
        "window.close" => window.close()?,
        "view.toggle_fullscreen" => window.set_fullscreen(!window.is_fullscreen()?)?,
        "window.open_current_workspace_in_new_window" => {
            open_current_workspace_in_new_window(window.clone(), EmptyRequest {}).await?;
        }
        _ => window.emit_to(
            tauri::EventTarget::webview_window(window.label()),
            "menu-action",
            request.id,
        )?,
    }
    Ok(OkResult::success())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocaleRequest {
    locale: String,
}
#[derive(Serialize)]
pub struct LocaleResult {
    locale: &'static str,
    ok: bool,
}
#[tauri::command]
pub async fn menu_set_locale(
    window: WebviewWindow,
    request: LocaleRequest,
) -> BackendResult<LocaleResult> {
    if request.locale.len() > 32 {
        return Err(BackendError::new("INVALID_REQUEST", "Invalid menu locale"));
    }
    let locale = super::menus::install(window.app_handle(), &request.locale)?;
    Ok(LocaleResult { locale, ok: true })
}
#[tauri::command]
pub async fn lifecycle_get_launch_info(
    window: WebviewWindow,
    request: EmptyRequest,
) -> BackendResult<super::launch::LaunchInfo> {
    let _ = request;
    super::launch::info(window.app_handle())
}
#[tauri::command]
pub async fn window_close_commit(
    window: WebviewWindow,
    request: EmptyRequest,
) -> BackendResult<()> {
    let _ = request;
    super::lifecycle::close_window(&window).await
}
