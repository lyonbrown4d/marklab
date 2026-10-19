mod actions;
mod active;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod messages;
mod policy;
#[cfg(test)]
mod tests;
#[cfg(target_os = "windows")]
mod windows;

use crate::{
  error::{BackendError, BackendResult},
  settings::SettingsStore,
};
#[cfg(target_os = "linux")]
use linux::Backend;
#[cfg(target_os = "macos")]
use macos::Backend;
pub use messages::{Action, Category, Request};
use std::sync::{Arc, Mutex};
use tauri::Manager;
#[cfg(target_os = "windows")]
use windows::Backend;

pub(super) struct NativeMessage {
  pub id: String,
  pub token: String,
  pub title: String,
  pub body: String,
}
pub(super) enum Event {
  Activated(String),
  Dismissed(String),
}
pub(super) type EventHandler = Arc<dyn Fn(Event) + Send + Sync + 'static>;

pub struct DesktopNotifications {
  app: tauri::AppHandle,
  backend: Backend,
  active: Arc<Mutex<active::Active>>,
  operation: tokio::sync::Mutex<()>,
  queued: Arc<tokio::sync::Semaphore>,
}
impl DesktopNotifications {
  pub fn new(app: &tauri::AppHandle) -> BackendResult<Self> {
    let active = Arc::new(Mutex::new(active::Active::default()));
    let owned = active.clone();
    let handle = app.clone();
    let callback: EventHandler = Arc::new(move |event| {
      let (token, activated) = match event {
        Event::Activated(token) => (token, true),
        Event::Dismissed(token) => (token, false),
      };
      let request = owned.lock().ok().and_then(|mut active| active.take(&token));
      if activated && let Some(request) = request {
        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
          actions::run(&handle, request).await;
        });
      }
    });
    Ok(Self {
      app: app.clone(),
      backend: Backend::new(app, callback)?,
      active,
      operation: tokio::sync::Mutex::new(()),
      queued: Arc::new(tokio::sync::Semaphore::new(32)),
    })
  }
  /// A notification is optional feedback: failure never changes the task's outcome.
  pub async fn show(&self, request: Request) -> bool {
    let category = request.category.name();
    match self.try_show(request).await {
      Ok(shown) => shown,
      Err(error) => {
        // OS errors may contain document paths or notification contents.
        log::warn!(target: "notifications", "notification could not be shown category={category} code={}", error.code);
        false
      }
    }
  }
  async fn try_show(&self, request: Request) -> BackendResult<bool> {
    if request.id.is_empty()
      || request.id.len() > 512
      || request.title.len() > 1024
      || request.body.len() > 4096
    {
      return Err(BackendError::new(
        "INVALID_NOTIFICATION",
        "Notification payload exceeds its limits",
      ));
    }
    let _operation = self.operation.lock().await;
    if !self.eligible(&request).await? {
      return Ok(false);
    }
    self.backend.prepare().await?;
    // Authorization can wait for the user. Re-read preferences and focus before delivery.
    if !self.eligible(&request).await? {
      return Ok(false);
    }
    let token = uuid::Uuid::new_v4().to_string();
    let message = NativeMessage {
      id: request.id.clone(),
      token: token.clone(),
      title: request.title.clone(),
      body: request.body.clone(),
    };
    let replaced = self
      .active
      .lock()
      .map_err(|_| state_error())?
      .replacements(&request.id);
    for id in replaced {
      // Retain the old action/handle if the OS rejects its close, allowing a retry.
      self.backend.close(&id).await?;
      self.active.lock().map_err(|_| state_error())?.remove(&id);
    }
    self
      .active
      .lock()
      .map_err(|_| state_error())?
      .insert(token.clone(), request);
    if let Err(error) = self.backend.show(&message).await {
      match self.backend.close(&message.id).await {
        Ok(()) => {
          self.active.lock().map_err(|_| state_error())?.take(&token);
        }
        Err(cleanup) => {
          log::warn!(target: "notifications", "notification cleanup failed code={}", cleanup.code)
        }
      }
      return Err(error);
    }
    Ok(true)
  }
  async fn eligible(&self, request: &Request) -> BackendResult<bool> {
    let settings = self.app.try_state::<SettingsStore>().ok_or_else(|| {
      BackendError::new(
        "NOTIFICATION_SETTINGS_UNAVAILABLE",
        "Notification preferences are unavailable",
      )
    })?;
    let preferences = settings.get("marklab.preferences", "main").await?;
    let focused = self
      .app
      .windows()
      .values()
      .any(|window| window.is_focused().unwrap_or(true));
    Ok(policy::Preferences::parse(preferences.as_ref()).allows(request.category, focused))
  }
  pub async fn close_all(&self) -> BackendResult<()> {
    let _operation = self.operation.lock().await;
    let ids = self.active.lock().map_err(|_| state_error())?.ids();
    for id in ids {
      self.backend.close(&id).await?;
    }
    *self.active.lock().map_err(|_| state_error())? = active::Active::default();
    Ok(())
  }
}
pub fn notify(app: &tauri::AppHandle, mut request: Request) {
  let Some(service) = app.try_state::<DesktopNotifications>() else {
    return;
  };
  let Ok(permit) = service.queued.clone().try_acquire_owned() else {
    log::warn!(target: "notifications", "notification skipped category={} code=NOTIFICATION_QUEUE_FULL", request.category.name());
    return;
  };
  if request.owner_window.is_none() {
    request.owner_window = request
      .owner
      .as_deref()
      .and_then(|label| crate::native_window::get(app, label));
  }
  let app = app.clone();
  // The optional OS feedback outlives a renderer request and cannot delay its completed task.
  tauri::async_runtime::spawn(async move {
    let _permit = permit;
    if let Some(service) = app.try_state::<DesktopNotifications>() {
      service.show(request).await;
    }
  });
}
fn state_error() -> BackendError {
  BackendError::new("NOTIFICATION_STATE", "Notification state is unavailable")
}
