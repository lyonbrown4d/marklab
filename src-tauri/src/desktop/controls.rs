use crate::{
    error::{BackendError, BackendResult},
    native_window::TrustedWindow as WebviewWindow,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, sync::Mutex};
use tauri::{Manager, State};
#[derive(Default)]
pub struct VimOwnership(pub Mutex<HashSet<String>>);
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VimRequest {
    active: bool,
}
#[derive(Serialize)]
pub struct OkResult {
    pub(super) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) error: Option<String>,
}
impl OkResult {
    pub(super) fn success() -> Self {
        Self {
            ok: true,
            error: None,
        }
    }
}
#[tauri::command]
pub async fn window_set_vim_keyboard_ownership(
    window: WebviewWindow,
    state: State<'_, VimOwnership>,
    request: VimRequest,
) -> BackendResult<()> {
    {
        let mut owned = state
            .0
            .lock()
            .map_err(|_| BackendError::new("STATE_ERROR", "Keyboard ownership unavailable"))?;
        if request.active {
            owned.insert(window.label().into());
        } else {
            owned.remove(window.label());
        }
    }
    if window.is_focused()? {
        super::menus::refresh_shortcuts(window.app_handle(), window.label())?;
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FullscreenRequest {
    fullscreen: bool,
}
#[tauri::command]
pub async fn window_set_fullscreen(
    window: WebviewWindow,
    request: FullscreenRequest,
) -> BackendResult<()> {
    window.set_fullscreen(request.fullscreen)?;
    Ok(())
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EditAction {
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditRequest {
    action: EditAction,
}
#[tauri::command]
pub async fn edit_execute(
    window: WebviewWindow,
    request: EditRequest,
) -> BackendResult<EditResult> {
    super::native_edit::execute(&window, request.action).await?;
    Ok(EditResult::success())
}

#[derive(Serialize)]
pub struct EditResult {
    pub(super) ok: bool,
    pub(super) error: Option<String>,
}
impl EditResult {
    pub(super) fn success() -> Self {
        Self {
            ok: true,
            error: None,
        }
    }
}
