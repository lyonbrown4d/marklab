use super::*;
use crate::workspace::WorkspaceRegistry;
use tauri::State;
fn owner(window: &TrustedWindow, registry: &WorkspaceRegistry) -> BackendResult<()> {
    registry.get(window.label())?.ensure_active()
}
pub(super) fn close(window: &TrustedWindow, manager: &WebTabs, id: &str) -> BackendResult<()> {
    let entry = manager
        .inner
        .owners
        .lock()
        .map_err(|_| failure("Web tab state unavailable"))?
        .get_mut(window.label())
        .and_then(|v| v.entries.remove(id));
    if let Some(mut entry) = entry {
        if let Some(load) = entry.load.take() {
            load.abort();
        }
        entry.state.active = false;
        entry.state.status = "closed".into();
        // Destruction must be attempted even if the owner cannot receive events.
        let closed = if let Some(view) = entry.view {
            native::remove_monitor(&view, entry.monitor);
            view.close().map_err(BackendError::from)
        } else {
            Ok(())
        };
        let emitted = window.emit_to(
            tauri::EventTarget::webview_window(window.label()),
            "web-tabs-state",
            Event::State { state: entry.state },
        );
        closed?;
        emitted?;
    }
    Ok(())
}
#[tauri::command]
pub async fn web_tabs_close(
    window: TrustedWindow,
    registry: State<'_, WorkspaceRegistry>,
    manager: State<'_, WebTabs>,
    request: Id,
) -> BackendResult<OkResult> {
    owner(&window, &registry)?;
    identifier(&request.tab_id)?;
    let _guard = manager.inner.operations.lock().await;
    close(&window, &manager, &request.tab_id)?;
    Ok(success())
}
#[tauri::command]
pub async fn web_tabs_hide(
    window: TrustedWindow,
    registry: State<'_, WorkspaceRegistry>,
    manager: State<'_, WebTabs>,
    request: Id,
) -> BackendResult<OkResult> {
    owner(&window, &registry)?;
    identifier(&request.tab_id)?;
    let _guard = manager.inner.operations.lock().await;
    if let Ok(entry) = manager.entry(window.label(), &request.tab_id) {
        if let Some(view) = entry.view {
            view.hide()?;
        }
        manager.change(&window, &request.tab_id, |entry| entry.state.active = false);
    }
    Ok(success())
}
#[tauri::command]
pub async fn web_tabs_set_bounds(
    window: TrustedWindow,
    registry: State<'_, WorkspaceRegistry>,
    manager: State<'_, WebTabs>,
    request: SetBounds,
) -> BackendResult<OkResult> {
    owner(&window, &registry)?;
    let _guard = manager.inner.operations.lock().await;
    let bounds = create::bounds(&window, &request.bounds)?;
    let entry = manager.entry(window.label(), &request.tab_id)?;
    if let Some(view) = entry.view {
        create::set_bounds(&view, &bounds)?;
    }
    manager.change(&window, &request.tab_id, |entry| entry.bounds = bounds);
    Ok(success())
}
#[tauri::command]
pub async fn web_tabs_navigate(
    window: TrustedWindow,
    registry: State<'_, WorkspaceRegistry>,
    manager: State<'_, WebTabs>,
    request: Navigate,
) -> BackendResult<OkResult> {
    owner(&window, &registry)?;
    let url = normalize(&request.url)?;
    let _guard = manager.inner.operations.lock().await;
    let entry = manager.entry(window.label(), &request.tab_id)?;
    let view = entry
        .view
        .ok_or_else(|| failure("Web tab view unavailable"))?;
    manager.loading(&window, &request.tab_id, url.to_string());
    view.navigate(url)?;
    Ok(success())
}
#[tauri::command]
pub async fn web_tabs_set_shortcut_bindings(
    window: TrustedWindow,
    registry: State<'_, WorkspaceRegistry>,
    manager: State<'_, WebTabs>,
    request: Bindings,
) -> BackendResult<OkResult> {
    owner(&window, &registry)?;
    let bindings = shortcuts::compile(request)?;
    manager
        .inner
        .owners
        .lock()
        .map_err(|_| failure("Web tab state unavailable"))?
        .entry(window.label().into())
        .or_default()
        .bindings = bindings;
    Ok(success())
}
macro_rules! action {
    ($name:ident,$action:expr) => {
        #[tauri::command]
        pub async fn $name(
            window: TrustedWindow,
            registry: State<'_, WorkspaceRegistry>,
            manager: State<'_, WebTabs>,
            request: Id,
        ) -> BackendResult<OkResult> {
            owner(&window, &registry)?;
            let _guard = manager.inner.operations.lock().await;
            let entry = manager.entry(window.label(), &request.tab_id)?;
            let view = entry
                .view
                .ok_or_else(|| failure("Web tab view unavailable"))?;
            native::action(&view, $action).await?;
            native::refresh(
                manager.inner().clone(),
                window.clone(),
                request.tab_id,
                &view,
            );
            Ok(success())
        }
    };
}
action!(web_tabs_go_back, "back");
action!(web_tabs_go_forward, "forward");
action!(web_tabs_reload, "reload");
action!(web_tabs_stop, "stop");
