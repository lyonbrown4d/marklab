use super::*;
use crate::workspace::WorkspaceRegistry;
use tauri::State;
fn owner(window: &TrustedWindow, registry: &WorkspaceRegistry) -> BackendResult<()> {
    registry.get(window.label())?.ensure_active()
}
#[tauri::command]
pub async fn web_tabs_activate(
    window: TrustedWindow,
    registry: State<'_, WorkspaceRegistry>,
    manager: State<'_, WebTabs>,
    request: Activate,
) -> BackendResult<OkResult> {
    let generation = registry.get(window.label())?.generation;
    owner(&window, &registry)?;
    identifier(&request.tab_id)?;
    let url = normalize(&request.url)?;
    let _guard = manager.inner.operations.lock().await;
    if registry.get(window.label())?.generation != generation {
        return Err(failure(
            "Workspace changed while waiting to activate web tab",
        ));
    }
    let bounds = create::bounds(&window, &request.bounds)?;
    for entry in manager.entries(window.label()) {
        if entry.state.tab_id != request.tab_id {
            if let Some(view) = entry.view {
                view.hide()?;
            }
            manager.change(&window, &entry.state.tab_id, |v| v.state.active = false);
        }
    }
    let existed = manager.entry(window.label(), &request.tab_id).ok();
    if existed.as_ref().is_none_or(|entry| entry.view.is_none()) {
        let instance = format!("tab-{}", uuid::Uuid::new_v4());
        manager
            .inner
            .owners
            .lock()
            .map_err(|_| failure("Web tab state unavailable"))?
            .entry(window.label().into())
            .or_default()
            .entries
            .insert(
                request.tab_id.clone(),
                Entry {
                    view: None,
                    state: TabState {
                        active: true,
                        can_go_back: false,
                        can_go_forward: false,
                        error: None,
                        status: "loading".into(),
                        tab_id: request.tab_id.clone(),
                        title: String::new(),
                        url: url.to_string(),
                    },
                    bounds: bounds.clone(),
                    touched: manager
                        .inner
                        .clock
                        .fetch_add(1, std::sync::atomic::Ordering::Relaxed),
                    generation: 0,
                    monitor: None,
                    instance: instance.clone(),
                    load: None,
                    focused: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                },
            );
        let view = match create::view(
            &manager,
            &window,
            &request.tab_id,
            &instance,
            url.clone(),
            &bounds,
        )
        .await
        {
            Ok(view) => view,
            Err(error) => {
                manager.change(&window, &request.tab_id, |v| {
                    v.state.status = "error".into();
                    v.state.error = Some(TabError {
                        description: bounded_text(&error.message, 1024),
                    });
                });
                return Err(error);
            }
        };
        let monitor = match native::install_monitor(
            manager.inner().clone(),
            window.clone(),
            request.tab_id.clone(),
            &view,
            manager.entry(window.label(), &request.tab_id)?.focused,
        )
        .await
        {
            Ok(monitor) => monitor,
            Err(error) => {
                let _ = view.close();
                return Err(error);
            }
        };
        if !manager.current(window.label(), &request.tab_id, &instance) {
            native::remove_monitor(&view, monitor);
            let _ = view.close();
            return Err(failure(
                "Web tab owner closed while creating the native view",
            ));
        }
        manager.change(&window, &request.tab_id, |entry| {
            entry.view = Some(view);
            entry.monitor = monitor;
        });
    }
    manager.change(&window, &request.tab_id, |entry| {
        entry.state.active = true;
        entry.bounds = bounds.clone();
        entry.touched = manager
            .inner
            .clock
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    });
    let entry = manager.entry(window.label(), &request.tab_id)?;
    if let Some(view) = entry.view {
        create::set_bounds(&view, &bounds)?;
        if entry.state.url != url.as_str() || entry.state.status == "error" {
            manager.loading(&window, &request.tab_id, url.to_string());
            view.navigate(url)?;
        } else if entry.state.status == "ready" {
            view.show()?;
        }
    }
    while manager.entries(window.label()).len() > 3 {
        let victim = manager
            .entries(window.label())
            .into_iter()
            .filter(|v| !v.state.active)
            .min_by_key(|v| v.touched);
        let Some(victim) = victim else {
            break;
        };
        close(&window, &manager, &victim.state.tab_id)?;
    }
    Ok(success())
}
fn close(window: &TrustedWindow, manager: &WebTabs, id: &str) -> BackendResult<()> {
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
        window.emit_to(
            window.label(),
            "web-tabs-state",
            Event::State { state: entry.state },
        )?;
        if let Some(view) = entry.view {
            native::remove_monitor(&view, entry.monitor);
            view.close()?;
        }
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
