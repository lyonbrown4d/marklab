pub use super::menu_sections::install;
use crate::error::{BackendError, BackendResult};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, menu::MenuItem};
#[derive(Default)]
pub struct MenuState {
    pub(super) items: Mutex<Vec<(MenuItem<tauri::Wry>, String)>>,
    pub(super) locale: Mutex<String>,
}
const ACTIONS: &[&str] = &[
    "file.new",
    "file.open_project",
    "file.open_file",
    "file.export_pdf",
    "file.export_docx",
    "file.export_html",
    "file.export_workspace",
    "window.open_current_workspace_in_new_window",
    "edit.undo",
    "edit.redo",
    "edit.cut",
    "edit.copy",
    "edit.paste",
    "edit.select_all",
    "view.wysiwyg",
    "view.source",
    "view.toggle_sidebar",
    "view.toggle_right_sidebar",
    "view.toggle_zen_mode",
    "view.toggle_focus_mode",
    "view.toggle_typewriter_mode",
    "view.toggle_fullscreen",
    "theme-mode.system",
    "theme-mode.light",
    "theme-mode.dark",
    "theme.paper",
    "theme.ivory",
    "theme.sepia",
    "theme.github",
    "theme.solarized",
    "theme.mist",
    "theme.ink",
    "theme.graphite",
    "theme.nord",
    "theme.obsidian",
    "help.about",
    "app.quit",
    "window.close",
];
pub fn valid_action(id: &str) -> bool {
    ACTIONS.contains(&id)
}
pub fn focused(app: &AppHandle) -> Option<crate::native_window::TrustedWindow> {
    let labels = app
        .try_state::<crate::workspace::WorkspaceRegistry>()?
        .labels()
        .ok()?;
    labels
        .iter()
        .filter_map(|label| crate::native_window::get(app, label))
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| crate::native_window::get(app, "main"))
        .or_else(|| {
            labels
                .first()
                .and_then(|label| crate::native_window::get(app, label))
        })
}
pub fn dispatch(app: &AppHandle, id: &str) -> BackendResult<()> {
    if !valid_action(id) {
        return Err(BackendError::new(
            "INVALID_MENU_ACTION",
            "Unsupported menu action",
        ));
    }
    if id == "app.quit" {
        return super::lifecycle::request_quit(app);
    }
    let Some(window) = focused(app) else {
        return Ok(());
    };
    match id {
        "edit.undo" | "edit.redo" | "edit.cut" | "edit.copy" | "edit.paste" | "edit.select_all" => {
            let id = id.to_owned();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = super::native_edit::dispatch_menu(&window, &id).await {
                    log::debug!("Native editing menu action failed: {}", error.code);
                }
            });
        }
        "window.close" => window.close()?,
        "view.toggle_fullscreen" => window.set_fullscreen(!window.is_fullscreen()?)?,
        "window.open_current_workspace_in_new_window" => {
            let app = app.clone();
            let source = window.label().to_string();
            tauri::async_runtime::spawn(async move {
                let result = async {
                    if let Some(window) = crate::native_window::get(&app, &source) {
                        super::lifecycle::request_renderer_flush(&window).await?;
                    }
                    let workspace = app
                        .state::<crate::workspace::WorkspaceRegistry>()
                        .get(&source)?;
                    let mut seed = app
                        .state::<crate::settings::SettingsStore>()
                        .read_session(&source)
                        .await?
                        .unwrap_or_default();
                    let root = workspace.root_info();
                    seed.state.insert("rootPath".into(), root.path.into());
                    seed.state.insert("rootKind".into(), root.kind.into());
                    super::windows::restore_window(&app, seed).await
                }
                .await;
                if let Err(error) = result {
                    log::warn!("New window failed: {}", error.code);
                }
            });
        }
        _ => window.emit_to(
            tauri::EventTarget::webview_window(window.label()),
            "menu-action",
            id,
        )?,
    }
    Ok(())
}
pub fn refresh_shortcuts(app: &AppHandle, label: &str) -> BackendResult<()> {
    let Some(state) = app.try_state::<MenuState>() else {
        return Ok(());
    };
    let owned = app
        .try_state::<super::commands::VimOwnership>()
        .is_some_and(|ownership| ownership.0.lock().is_ok_and(|owned| owned.contains(label)));
    let items = state
        .items
        .lock()
        .map_err(|_| BackendError::new("MENU_ERROR", "Menu state is unavailable"))?
        .clone();
    for (item, accelerator) in items {
        item.set_accelerator(if owned { None } else { Some(accelerator) })?;
    }
    Ok(())
}
