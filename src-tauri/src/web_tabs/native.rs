use super::*;
#[cfg(any(target_os = "linux", target_os = "macos"))]
mod cef;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod mac;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use mac as platform;
#[cfg(target_os = "windows")]
use windows as platform;
pub async fn action(view: &Webview, action: &'static str) -> BackendResult<()> {
  #[cfg(any(target_os = "linux", target_os = "macos"))]
  return cef::action(view, action).await;
  #[cfg(target_os = "windows")]
  return platform::action(view, action).await;
}
pub fn refresh(manager: WebTabs, window: TrustedWindow, id: String, view: &Webview) {
  #[cfg(any(target_os = "linux", target_os = "macos"))]
  cef::refresh(manager, window, id, view);
  #[cfg(target_os = "windows")]
  platform::refresh(manager, window, id, view);
}
pub async fn bindings_changed(manager: &WebTabs, owner: &str) -> BackendResult<()> {
  #[cfg(target_os = "linux")]
  return linux::bindings_changed(manager, owner).await;
  #[cfg(not(target_os = "linux"))]
  {
    let _ = (manager, owner);
    Ok(())
  }
}
pub async fn install_monitor(
  manager: WebTabs,
  window: TrustedWindow,
  id: String,
  view: &Webview,
  focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<Option<usize>> {
  platform::install_monitor(manager, window, id, view, focused).await
}
pub fn remove_monitor(view: &Webview, token: Option<usize>) {
  platform::remove_monitor(view, token);
}

pub async fn focused(
  view: &Webview,
  focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<bool> {
  tokio::time::timeout(
    std::time::Duration::from_secs(2),
    platform::focused(view, focused),
  )
  .await
  .map_err(|_| failure("Native web tab focus query timed out"))?
}
