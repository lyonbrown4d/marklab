pub use super::events::{run_event, window_event};
use crate::{
  error::{BackendError, BackendResult},
  workspace::WorkspaceRegistry,
};
use std::{
  collections::HashMap,
  sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
  },
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tokio::sync::oneshot;
#[derive(Default)]
pub struct QuitState(pub AtomicBool);
#[derive(Default)]
pub struct LifecycleGate(pub std::sync::Arc<tokio::sync::Mutex<()>>);
type PendingFlush = (String, oneshot::Sender<BackendResult<()>>);
#[derive(Default)]
pub struct FlushState(Mutex<HashMap<String, PendingFlush>>);
struct FlushTicket {
  window: WebviewWindow,
  id: String,
}
impl Drop for FlushTicket {
  fn drop(&mut self) {
    if let Ok(mut pending) = self.window.state::<FlushState>().0.lock() {
      pending.remove(&self.id);
    }
  }
}
#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FlushResult {
  request_id: String,
  #[serde(default)]
  error: Option<String>,
}
#[tauri::command]
#[specta::specta]
pub async fn window_flush_result(
  window: crate::native_window::TrustedWindow,
  request: FlushResult,
) -> BackendResult<()> {
  let state = window.state::<FlushState>();
  let mut pending = state
    .0
    .lock()
    .map_err(|_| failure("Renderer flush registry is unavailable"))?;
  if pending
    .get(&request.request_id)
    .is_some_and(|(owner, _)| owner == window.label())
    && let Some((_, sender)) = pending.remove(&request.request_id)
  {
    let result = request
      .error
      .map(|message| Err(failure(&message.chars().take(1000).collect::<String>())))
      .unwrap_or(Ok(()));
    let _ = sender.send(result);
  }
  Ok(())
}
fn failure(message: &str) -> BackendError {
  BackendError::new("WINDOW_FLUSH_FAILED", message)
}
pub async fn request_renderer_flush(window: &WebviewWindow) -> BackendResult<()> {
  if !window
    .state::<super::startup::StartupState>()
    .interactive(window.label())
  {
    return Ok(());
  }
  let id = uuid::Uuid::new_v4().to_string();
  let (sender, receiver) = oneshot::channel();
  window
    .state::<FlushState>()
    .0
    .lock()
    .map_err(|_| failure("Renderer flush registry is unavailable"))?
    .insert(id.clone(), (window.label().into(), sender));
  let _ticket = FlushTicket {
    window: window.clone(),
    id: id.clone(),
  };
  async {
    crate::desktop::event_contracts::WINDOW_FLUSH_REQUESTED.emit_to(
      window.app_handle(),
      tauri::EventTarget::webview_window(window.label()),
      &(crate::desktop::event_contracts::WindowFlushRequested {
        request_id: id.clone(),
      }),
    )?;
    tokio::time::timeout(std::time::Duration::from_secs(30), receiver)
      .await
      .map_err(|_| failure("The editor did not finish saving. The window remains open."))?
      .map_err(|_| failure("The editor closed before saving completed"))?
  }
  .await
}
pub fn request_quit(app: &AppHandle) -> BackendResult<()> {
  if app
    .state::<QuitState>()
    .0
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
    .is_err()
  {
    return Ok(());
  }
  if !super::startup::initialized(app) {
    app.exit(0);
    return Ok(());
  }
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    if let Err(error) = quit_all(&app).await {
      app.state::<WorkspaceRegistry>().cancel_shutdown();
      app.state::<QuitState>().0.store(false, Ordering::Release);
      log::error!("Application quit cancelled: {}", error.message);
      use tauri_plugin_dialog::DialogExt;
      app
        .dialog()
        .message(error.message.clone())
        .title("Marklab — Save failed")
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .show(|_| {});
      for label in app
        .state::<WorkspaceRegistry>()
        .labels()
        .unwrap_or_default()
      {
        if let Some(window) = crate::native_window::get(&app, &label) {
          let _ = crate::desktop::event_contracts::WINDOW_CLOSE_ERROR.emit_to(
            window.app_handle(),
            tauri::EventTarget::webview_window(window.label()),
            &(crate::desktop::event_contracts::WindowCloseError {
              message: error.message.clone(),
            }),
          );
        }
      }
    }
  });
  Ok(())
}
async fn quit_all(app: &AppHandle) -> BackendResult<()> {
  let gate = app.state::<LifecycleGate>();
  let _operation = gate.0.lock().await;
  let registry = app.state::<WorkspaceRegistry>();
  registry.begin_shutdown()?;
  let mut labels = registry.labels()?;
  labels.sort();
  let windows = labels
    .iter()
    .filter_map(|label| crate::native_window::get(app, label))
    .collect::<Vec<_>>();
  futures_util::future::try_join_all(windows.iter().map(|window| request_renderer_flush(window)))
    .await?;
  let mut paused = super::flush::PausedWindows::new(app);
  paused.hide(&windows)?;
  let workspaces = super::flush::unique_workspaces(&registry, &labels)?;
  let mut barriers = Vec::with_capacity(workspaces.len());
  for workspace in &workspaces {
    barriers.push(workspace.mutation.lock().await);
  }
  for workspace in &workspaces {
    workspace.flush_buffers_under_lock().await?;
  }
  for window in &windows {
    super::geometry::persist(window).await?;
  }
  app
    .state::<crate::settings::SettingsStore>()
    .save_window_sessions(&labels)
    .await?;
  crate::platform::updates::install_if_scheduled(app).await?;
  for label in &labels {
    cleanup_window(app, label).await?;
    registry.close(label)?;
  }
  for window in windows {
    window.destroy()?;
  }
  for window in app.webview_windows().values() {
    if window.label() == "splash" || window.label().starts_with("opening-") {
      let _ = window.destroy();
    }
  }
  drop(barriers);
  app.exit(0);
  Ok(())
}
pub async fn close_window(window: &WebviewWindow) -> BackendResult<()> {
  let app = window.app_handle();
  let gate = app.state::<LifecycleGate>();
  let _operation = gate.0.lock().await;
  let startup = app.state::<super::startup::StartupState>();
  let owner = startup.owner(window.label());
  if app.state::<QuitState>().0.load(Ordering::Acquire) {
    return Err(failure(
      "Application shutdown is already saving this window",
    ));
  }
  let mut closing = super::flush::ClosingWindow::begin(app, &owner)?;
  let mut paused = super::flush::PausedWindows::visibility(app);
  if let Some(main) = crate::native_window::get(app, &owner) {
    paused.hide(std::slice::from_ref(&main))?;
    request_renderer_flush(&main).await?;
  }
  if let Some(registry) = app.try_state::<WorkspaceRegistry>()
    && let Ok(workspace) = registry.get(&owner)
  {
    workspace.flush_buffers().await?;
    if let Some(main) = crate::native_window::get(app, &owner) {
      super::geometry::persist(&main).await?;
    }
    cleanup_window(app, &owner).await?;
    app
      .state::<crate::settings::SettingsStore>()
      .remove_session(&owner)
      .await?;
    registry.close_async(&owner).await?;
  }
  closing.commit();
  if let Some(main) = crate::native_window::get(app, &owner) {
    main.destroy()?;
  }
  if let Some(opening) = crate::native_window::get(app, &format!("opening-{owner}")) {
    opening.destroy()?;
  }
  if window.label() == "splash" {
    window.destroy()?;
  }
  if cfg!(not(target_os = "macos"))
    && app
      .try_state::<WorkspaceRegistry>()
      .is_none_or(|registry| registry.labels().is_ok_and(|labels| labels.is_empty()))
  {
    app.exit(0);
  }
  Ok(())
}
pub async fn cleanup_window(app: &AppHandle, owner: &str) -> BackendResult<()> {
  if let Some(web_tabs) = app.try_state::<crate::web_tabs::WebTabs>() {
    web_tabs.close_window(owner);
  }
  if let Some(preview) = app.try_state::<crate::link_preview::LinkPreviewService>() {
    preview.close_window(owner).await;
  }
  if let Some(terminal) = app.try_state::<crate::terminal::TerminalState>() {
    terminal.close_window(owner);
  }
  if let Some(ai) = app.try_state::<crate::ai::AiService>() {
    ai.cancel_owner(owner).await;
  }
  if let Some(sync) = app.try_state::<crate::sync::SyncService>() {
    sync.cancel_owner(owner).await;
  }
  if let Some(language) = app.try_state::<crate::language::LanguageService>() {
    language.close_client(owner.into()).await?;
  }
  if let Some(export) = app.try_state::<crate::export::ExportService>() {
    export.cancel_owner(owner)?;
  }
  if let Some(assets) = app.try_state::<crate::assets::AssetService>() {
    assets.revoke_window(owner)?;
  }
  if let Some(vim) = app.try_state::<super::commands::VimOwnership>()
    && let Ok(mut owned) = vim.0.lock()
  {
    owned.remove(owner);
  }
  Ok(())
}
