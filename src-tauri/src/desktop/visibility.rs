use std::{collections::HashMap, sync::Mutex};
use tauri::{AppHandle, Manager};
#[derive(Default)]
pub struct Visibility(Mutex<HashMap<String, bool>>);
/// Tauri does not expose desktop hide/minimize notifications. Reconcile only
/// after an existing native event, without timers or background polling.
pub fn refresh(app: &AppHandle) {
  let Some(tabs) = app.try_state::<crate::web_tabs::WebTabs>() else {
    return;
  };
  let Some(registry) = app.try_state::<crate::workspace::WorkspaceRegistry>() else {
    return;
  };
  let Ok(labels) = registry.labels() else {
    return;
  };
  let state = app.state::<Visibility>();
  let Ok(mut previous) = state.0.lock() else {
    return;
  };
  previous.retain(|label, _| labels.contains(label));
  for label in labels {
    if let Some(window) = crate::native_window::get(app, &label) {
      let visible = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true);
      if previous.insert(label.clone(), visible) != Some(visible) {
        if visible {
          tabs.resume(&label);
        } else {
          tabs.suspend(&label);
        }
      }
    }
  }
}
