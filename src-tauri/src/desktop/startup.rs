use super::policy::{Phase, ReadyAction, ready_action};
use crate::error::{BackendError, BackendResult};
use serde::Serialize;
use std::{
  collections::HashMap,
  sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
  },
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
  pub stage: &'static str,
  pub workspace_path: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSeed {
  #[serde(flatten)]
  value: crate::settings::PersistedValue,
  native_attempt: u64,
  #[serde(skip_serializing_if = "Option::is_none")]
  native_generation: Option<u64>,
}
pub fn seed(
  app: &AppHandle,
  owner: &str,
  value: crate::settings::PersistedValue,
) -> BackendResult<SessionSeed> {
  let native_attempt = app
    .state::<StartupState>()
    .boot(owner)?
    .map(|boot| boot.attempt)
    .unwrap_or(1);
  let native_generation = app
    .try_state::<crate::workspace::WorkspaceRegistry>()
    .and_then(|registry| registry.get(owner).ok())
    .map(|workspace| workspace.generation);
  Ok(SessionSeed {
    value,
    native_attempt,
    native_generation,
  })
}
#[derive(Clone)]
pub struct Boot {
  pub phase: Phase,
  pub progress: Progress,
  pub attempt: u64,
  pub target: Option<String>,
}
#[derive(Default)]
pub struct StartupState {
  pub boots: Mutex<HashMap<String, Boot>>,
  pub initialized: AtomicBool,
  pub initializing: AtomicBool,
  pub native_paths: Mutex<Vec<String>>,
}
impl StartupState {
  pub fn queue_native(&self, paths: &[String]) -> BackendResult<bool> {
    let mut pending = self.native_paths.lock().map_err(|_| state_error())?;
    if !self.initialized.load(Ordering::Acquire) || self.initializing.load(Ordering::Acquire) {
      pending.extend_from_slice(paths);
      return Ok(true);
    }
    Ok(false)
  }
  pub fn finish_initialization(&self) -> BackendResult<Vec<String>> {
    let mut pending = self.native_paths.lock().map_err(|_| state_error())?;
    self.initializing.store(false, Ordering::Release);
    Ok(if self.initialized.load(Ordering::Acquire) {
      pending.drain(..).collect()
    } else {
      Vec::new()
    })
  }
  pub fn owner(&self, label: &str) -> String {
    label.strip_prefix("opening-").unwrap_or(label).to_string()
  }
  pub fn begin(&self, label: &str, target: Option<String>) -> BackendResult<u64> {
    let mut boots = self.boots.lock().map_err(|_| state_error())?;
    let attempt = boots.get(label).map(|boot| boot.attempt + 1).unwrap_or(1);
    boots.insert(
      label.into(),
      Boot {
        phase: Phase::Loading,
        progress: Progress {
          stage: "loading",
          workspace_path: target.clone().unwrap_or_default(),
          error: None,
        },
        attempt,
        target,
      },
    );
    Ok(attempt)
  }
  pub fn boot(&self, label: &str) -> BackendResult<Option<Boot>> {
    Ok(
      self
        .boots
        .lock()
        .map_err(|_| state_error())?
        .get(label)
        .cloned(),
    )
  }
  pub fn interactive(&self, label: &str) -> bool {
    self
      .boot(label)
      .ok()
      .flatten()
      .is_some_and(|boot| boot.phase == Phase::Interactive)
  }
  pub fn progress(&self, label: &str, progress: Progress) -> BackendResult<()> {
    let mut boots = self.boots.lock().map_err(|_| state_error())?;
    if let Some(boot) = boots.get_mut(label) {
      boot.phase = if progress.error.is_some() {
        Phase::Failed
      } else {
        Phase::Loading
      };
      boot.progress = progress;
    }
    Ok(())
  }
}
fn state_error() -> BackendError {
  BackendError::new("STARTUP_STATE_ERROR", "Window startup state is unavailable")
}
pub fn emit_progress(app: &AppHandle, label: &str) {
  if let Ok(Some(boot)) = app.state::<StartupState>().boot(label) {
    for target in [label.to_string(), format!("opening-{label}")] {
      if let Some(window) = crate::native_window::get(app, &target) {
        let _ = window.emit_to(
          tauri::EventTarget::webview_window(window.label()),
          "window-opening-progress",
          boot.progress.clone(),
        );
      }
    }
  }
}
pub async fn failed(app: &AppHandle, label: &str, error: String) -> BackendResult<()> {
  let state = app.state::<StartupState>();
  let target = state.boot(label)?.and_then(|boot| boot.target);
  state.progress(
    label,
    Progress {
      stage: "failed",
      workspace_path: target.unwrap_or_default(),
      error: Some(error),
    },
  )?;
  super::windows::ensure_opening(app, label)?;
  emit_progress(app, label);
  if label == "main"
    && let Some(splash) = crate::native_window::get(app, "splash")
  {
    let _ = splash.destroy();
  }
  Ok(())
}
pub async fn ready(
  window: &WebviewWindow,
  phase: &str,
  error: Option<String>,
  attempt: Option<u64>,
) -> BackendResult<()> {
  let app = window.app_handle();
  let state = app.state::<StartupState>();
  let owner = state.owner(window.label());
  if window.label().starts_with("opening-") {
    emit_progress(app, &owner);
    return Ok(());
  }
  let boot = state.boot(&owner)?;
  let expected = boot.as_ref().map(|boot| boot.attempt).unwrap_or(1);
  if !super::policy::accepts_ready_attempt(expected, attempt, phase) {
    return Ok(());
  }
  let current = boot.map(|boot| boot.phase).unwrap_or(Phase::Loading);
  match ready_action(current, phase) {
    ReadyAction::ShowWorkspace => {
      super::geometry::apply_pending_maximize(window)?;
      window.show()?;
      window.set_focus()?;
      if let Some(opening) = crate::native_window::get(app, &format!("opening-{owner}")) {
        opening.destroy()?;
      }
      if owner == "main"
        && let Some(splash) = crate::native_window::get(app, "splash")
      {
        splash.destroy()?;
      }
      if let Some(boot) = state
        .boots
        .lock()
        .map_err(|_| state_error())?
        .get_mut(&owner)
      {
        boot.phase = Phase::Interactive;
      }
      window.emit_to(
        tauri::EventTarget::webview_window(window.label()),
        "window-presented",
        (),
      )?;
      super::launch::flush(app, window)?;
    }
    ReadyAction::ShowFailure => {
      failed(
        app,
        &owner,
        error.unwrap_or_else(|| "Workspace renderer initialization failed".into()),
      )
      .await?;
    }
    _ => {}
  }
  Ok(())
}
pub fn schedule_timeout(app: &AppHandle, label: &str, attempt: u64) {
  let app = app.clone();
  let label = label.to_string();
  tauri::async_runtime::spawn(async move {
    tokio::time::sleep(std::time::Duration::from_secs(40)).await;
    if app
      .state::<StartupState>()
      .boot(&label)
      .ok()
      .flatten()
      .is_some_and(|boot| boot.attempt == attempt && boot.phase == Phase::Loading)
    {
      let _ = failed(
        &app,
        &label,
        "Workspace startup timed out. Retry opening the window.".into(),
      )
      .await;
    }
  });
}
pub fn initialized(app: &AppHandle) -> bool {
  app
    .state::<StartupState>()
    .initialized
    .load(Ordering::Acquire)
}
