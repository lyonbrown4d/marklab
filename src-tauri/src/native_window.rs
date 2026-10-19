use crate::error::{BackendError, BackendResult};
use std::{collections::HashMap, ops::Deref, sync::RwLock};
use tauri::{
  Manager,
  ipc::{CommandArg, CommandItem, InvokeError},
};
/// Original root handles remain valid after native child webviews are attached.
#[derive(Default)]
pub struct NativeWindows {
  windows: RwLock<HashMap<String, tauri::WebviewWindow>>,
}
#[derive(Clone)]
pub struct TrustedWindow(tauri::WebviewWindow);
impl Deref for TrustedWindow {
  type Target = tauri::WebviewWindow;
  fn deref(&self) -> &Self::Target {
    &self.0
  }
}
impl AsRef<tauri::WebviewWindow> for TrustedWindow {
  fn as_ref(&self) -> &tauri::WebviewWindow {
    &self.0
  }
}
impl NativeWindows {
  pub fn register(&self, window: &tauri::WebviewWindow) -> BackendResult<()> {
    self
      .windows
      .write()
      .map_err(|_| BackendError::new("WINDOW_STATE", "Window registry is unavailable"))?
      .insert(window.label().into(), window.clone());
    Ok(())
  }
  pub fn remove(&self, label: &str) -> BackendResult<()> {
    self
      .windows
      .write()
      .map_err(|_| BackendError::new("WINDOW_STATE", "Window registry is unavailable"))?
      .remove(label);
    Ok(())
  }
  pub fn get(&self, label: &str) -> Option<TrustedWindow> {
    self
      .windows
      .read()
      .ok()?
      .get(label)
      .cloned()
      .map(TrustedWindow)
  }
}
pub fn register(window: &tauri::WebviewWindow) -> BackendResult<()> {
  window
    .app_handle()
    .try_state::<NativeWindows>()
    .ok_or_else(|| BackendError::new("WINDOW_STATE", "Window registry is not initialized"))?
    .register(window)
}
pub fn get(app: &tauri::AppHandle, label: &str) -> Option<TrustedWindow> {
  app.try_state::<NativeWindows>()?.get(label)
}
pub fn unregister(app: &tauri::AppHandle, label: &str) -> BackendResult<()> {
  app
    .try_state::<NativeWindows>()
    .ok_or_else(|| BackendError::new("WINDOW_STATE", "Window registry is not initialized"))?
    .remove(label)
}
impl<'de> CommandArg<'de, tauri::Wry> for TrustedWindow {
  fn from_command(command: CommandItem<'de, tauri::Wry>) -> Result<Self, InvokeError> {
    let webview = command.message.webview();
    let window = webview.window();
    if !is_trusted(&webview) {
      return Err(InvokeError::from(
        "Only the trusted root webview can invoke desktop commands",
      ));
    }
    get(webview.app_handle(), window.label())
      .ok_or_else(|| InvokeError::from("Desktop window is not registered"))
  }
}
pub fn is_trusted(webview: &tauri::Webview) -> bool {
  let window = webview.window();
  if webview.label() != window.label() || get(webview.app_handle(), window.label()).is_none() {
    return false;
  }
  let Ok(url) = webview.url() else {
    return false;
  };
  if !url.username().is_empty() || url.password().is_some() {
    return false;
  }
  let local = url.scheme() == "tauri" && url.host_str() == Some("localhost")
    || ["http", "https"].contains(&url.scheme())
      && url.host_str() == Some("tauri.localhost")
      && url.port().is_none();
  let development = cfg!(debug_assertions)
    && url.scheme() == "http"
    && url.host_str() == Some("localhost")
    && url.port() == Some(5173);
  (local || development)
    && ["", "index.html", "window-opening.html", "splashscreen.html"]
      .contains(&url.path().trim_start_matches('/'))
}
