use crate::{
    error::{BackendError, BackendResult},
    settings::{SettingsStore, WindowState},
    workspace::{RootInfo, WorkspaceRegistry},
};
use std::{collections::HashMap, sync::Mutex};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewWindow};
#[derive(Clone)]
struct Cached {
    state: WindowState,
    scope: String,
    generation: u64,
}
#[derive(Default)]
pub struct GeometryState(Mutex<HashMap<String, Cached>>);
fn scope(root: &RootInfo) -> BackendResult<String> {
    crate::database::workspace_key(&root.kind, &root.path)
}
fn state_error() -> BackendError {
    BackendError::new("WINDOW_STATE_ERROR", "Window geometry state is unavailable")
}
pub async fn restore(app: &AppHandle, label: &str) -> BackendResult<WindowState> {
    let root = app.state::<WorkspaceRegistry>().get(label)?.root_info();
    let scope = scope(&root)?;
    let settings = app.state::<SettingsStore>();
    let saved = match settings.get_window_state(&scope).await? {
        Some(value) => Some(value),
        None => settings.get_window_state("main").await?,
    };
    let state = saved.unwrap_or(WindowState {
        width: 800,
        height: 600,
        x: None,
        y: None,
        is_maximized: false,
    });
    app.state::<GeometryState>()
        .0
        .lock()
        .map_err(|_| state_error())?
        .insert(
            label.into(),
            Cached {
                state: state.clone(),
                scope,
                generation: 0,
            },
        );
    Ok(state)
}
pub fn apply_pending_maximize(window: &WebviewWindow) -> BackendResult<()> {
    let maximized = window
        .state::<GeometryState>()
        .0
        .lock()
        .map_err(|_| state_error())?
        .get(window.label())
        .is_some_and(|cached| cached.state.is_maximized);
    if maximized {
        window.maximize()?;
    }
    Ok(())
}
pub async fn activate(window: &WebviewWindow, root: &RootInfo) -> BackendResult<()> {
    persist(window).await?;
    let key = scope(root)?;
    if let Some(state) = window
        .state::<SettingsStore>()
        .get_window_state(&key)
        .await?
    {
        if window.is_maximized()? {
            window.unmaximize()?;
        }
        window.set_size(LogicalSize::new(
            state.width.max(640),
            state.height.max(480),
        ))?;
        if let (Some(x), Some(y)) = (state.x, state.y) {
            let displays = window
                .available_monitors()?
                .into_iter()
                .map(|monitor| {
                    let rect = *monitor.work_area();
                    super::policy::DisplayArea {
                        x: rect.position.x,
                        y: rect.position.y,
                        width: rect.size.width,
                        height: rect.size.height,
                        scale_factor: monitor.scale_factor(),
                    }
                })
                .collect::<Vec<_>>();
            if super::policy::visible_rectangle(x, y, state.width, state.height, &displays) {
                window.set_position(PhysicalPosition::new(x, y))?;
            } else {
                window.center()?;
            }
        }
        if state.is_maximized {
            window.maximize()?;
        }
        window
            .state::<GeometryState>()
            .0
            .lock()
            .map_err(|_| state_error())?
            .insert(
                window.label().into(),
                Cached {
                    state,
                    scope: key,
                    generation: 0,
                },
            );
    } else if let Some(cached) = window
        .state::<GeometryState>()
        .0
        .lock()
        .map_err(|_| state_error())?
        .get_mut(window.label())
    {
        cached.scope = key;
    }
    Ok(())
}
pub async fn persist(window: &WebviewWindow) -> BackendResult<()> {
    let maximized = window.is_maximized()?;
    let fullscreen = window.is_fullscreen()?;
    let mut cached = {
        window
            .state::<GeometryState>()
            .0
            .lock()
            .map_err(|_| state_error())?
            .get(window.label())
            .cloned()
    };
    if let Some(value) = &mut cached {
        if !maximized && !fullscreen && !window.is_minimized()? {
            let size = window
                .inner_size()?
                .to_logical::<u32>(window.scale_factor()?);
            let position = window.outer_position()?;
            value.state.width = size.width.max(640);
            value.state.height = size.height.max(480);
            value.state.x = Some(position.x);
            value.state.y = Some(position.y);
        }
        value.state.is_maximized = maximized;
        window
            .state::<SettingsStore>()
            .set_window_state(&value.scope, &value.state)
            .await?;
        window
            .state::<SettingsStore>()
            .set_window_state("main", &value.state)
            .await?;
        window
            .state::<GeometryState>()
            .0
            .lock()
            .map_err(|_| state_error())?
            .insert(window.label().into(), value.clone());
    }
    Ok(())
}
pub fn changed(app: &AppHandle, label: &str) {
    let state = app.state::<GeometryState>();
    let generation = if let Ok(mut cache) = state.0.lock() {
        if let Some(value) = cache.get_mut(label) {
            value.generation += 1;
            value.generation
        } else {
            return;
        }
    } else {
        return;
    };
    let app = app.clone();
    let label = label.to_string();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        let current = app
            .state::<GeometryState>()
            .0
            .lock()
            .ok()
            .and_then(|cache| cache.get(&label).map(|value| value.generation));
        if current != Some(generation) {
            return;
        }
        if let Some(window) = crate::native_window::get(&app, &label)
            && let Err(error) = persist(&window).await
        {
            log::warn!("Window geometry save failed: {}", error.code);
        }
    });
}
pub fn remove(app: &AppHandle, label: &str) {
    if let Ok(mut cache) = app.state::<GeometryState>().0.lock() {
        cache.remove(label);
    }
}
