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
  restore_default: bool,
}
#[derive(Default)]
pub struct GeometryState(Mutex<HashMap<String, Cached>>);
fn scope(root: &RootInfo) -> BackendResult<String> {
  crate::database::workspace_key(root.kind.as_str(), &root.path)
}
fn state_error() -> BackendError {
  BackendError::new("WINDOW_STATE_ERROR", "Window geometry state is unavailable")
}
fn normal_size(window: &WebviewWindow) -> BackendResult<LogicalSize<u32>> {
  #[cfg(target_os = "macos")]
  let size = {
    // Overlay webview bounds include the titlebar; set_size/inner_size on
    // the builder take the content rect. Persist that rect to avoid growth.
    let outer = window.outer_size()?;
    let titlebar = (window.inner_position()?.y - window.outer_position()?.y).max(0) as u32;
    tauri::PhysicalSize::new(outer.width, outer.height.saturating_sub(titlebar))
  };
  #[cfg(not(target_os = "macos"))]
  let size = window.inner_size()?;
  Ok(size.to_logical::<u32>(window.scale_factor()?))
}
pub async fn restore(app: &AppHandle, label: &str) -> BackendResult<WindowState> {
  let root = app.state::<WorkspaceRegistry>().get(label)?.root_info();
  let scope = scope(&root)?;
  let settings = app.state::<SettingsStore>();
  let workspace_state = settings.get_window_state(&scope).await?;
  let saved = match workspace_state {
    Some(value) => Some(value),
    None => settings.get_window_state("main").await?,
  };
  // Retain existing layouts during adoption. The plugin is the fallback when
  // neither a workspace layout nor the previous default exists in SQLite.
  let restore_default =
    saved.is_none() && label == "main" && super::window_state::has_defaults(app).await?;
  let state = saved.unwrap_or(WindowState {
    width: 800,
    height: 600,
    x: None,
    y: None,
    is_maximized: false,
  });
  app
    .state::<GeometryState>()
    .0
    .lock()
    .map_err(|_| state_error())?
    .insert(
      label.into(),
      Cached {
        state: state.clone(),
        scope,
        generation: 0,
        restore_default,
      },
    );
  Ok(state)
}
pub fn apply_default(window: &WebviewWindow) -> BackendResult<bool> {
  let state = window.state::<GeometryState>();
  let restore = state
    .0
    .lock()
    .map_err(|_| state_error())?
    .get(window.label())
    .is_some_and(|cached| cached.restore_default);
  if restore {
    // The plugin restored defaults synchronously in on_window_ready, before
    // attaching its move/resize listeners. Never replay stale SQLite defaults.
    let size = normal_size(window)?;
    let position = window.outer_position()?;
    if let Some(cached) = state
      .0
      .lock()
      .map_err(|_| state_error())?
      .get_mut(window.label())
    {
      cached.state.width = size.width.max(640);
      cached.state.height = size.height.max(480);
      cached.state.x = Some(position.x);
      cached.state.y = Some(position.y);
      cached.restore_default = false;
    }
  } else if window.label() == "main" && !cfg!(target_os = "macos") {
    // A workspace-specific size takes precedence over the plugin's default.
    let size = state
      .0
      .lock()
      .map_err(|_| state_error())?
      .get(window.label())
      .map(|cached| (cached.state.width, cached.state.height));
    if let Some((width, height)) = size {
      window.set_size(LogicalSize::new(width.max(640), height.max(480)))?;
    }
  }
  Ok(restore)
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
    if super::window_state_commands::read_maximized(window).await? {
      super::window_state_commands::set_maximized(window, false).await?;
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
      super::window_state_commands::set_maximized(window, true).await?;
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
          restore_default: false,
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
  let maximized = super::window_state_commands::read_maximized(window).await?;
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
      let size = normal_size(window)?;
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
    if window.label() == "main"
      && let Err(error) = super::window_state::save_default(window.app_handle()).await
    {
      // Preferences must never block an otherwise successful document save/close.
      log::warn!("Default window geometry save failed: {}", error.code);
    }
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
  // Initial resize events must not overwrite the pending workspace restore.
  if !app
    .state::<super::startup::StartupState>()
    .interactive(label)
  {
    return;
  }
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
