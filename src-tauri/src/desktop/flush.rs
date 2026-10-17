use super::lifecycle::{QuitState, request_renderer_flush};
use crate::{
    error::{BackendError, BackendResult},
    native_window::TrustedWindow,
    workspace::WorkspaceRegistry,
};
use std::{future::Future, sync::atomic::Ordering};
use tauri::{AppHandle, Manager};
pub(super) struct PausedWindows {
    app: AppHandle,
    visible: Vec<(TrustedWindow, bool)>,
    owns_shutdown: bool,
}
impl PausedWindows {
    pub(super) fn new(app: &AppHandle) -> Self {
        Self {
            app: app.clone(),
            visible: Vec::new(),
            owns_shutdown: true,
        }
    }
    pub(super) fn visibility(app: &AppHandle) -> Self {
        Self {
            app: app.clone(),
            visible: Vec::new(),
            owns_shutdown: false,
        }
    }
    pub(super) fn hide(&mut self, windows: &[TrustedWindow]) -> BackendResult<()> {
        for window in windows {
            if window.is_visible()? {
                self.visible.push((window.clone(), window.is_focused()?));
                window.hide()?;
            }
        }
        Ok(())
    }
}
impl Drop for PausedWindows {
    fn drop(&mut self) {
        if self.owns_shutdown {
            if let Some(registry) = self.app.try_state::<WorkspaceRegistry>() {
                registry.cancel_shutdown();
            }
            self.app
                .state::<QuitState>()
                .0
                .store(false, Ordering::Release);
        }
        for (window, focused) in &self.visible {
            let _ = window.show();
            if *focused {
                let _ = window.set_focus();
            }
        }
    }
}
pub(super) fn unique_workspaces(
    registry: &WorkspaceRegistry,
    labels: &[String],
) -> BackendResult<Vec<std::sync::Arc<crate::workspace::Workspace>>> {
    let mut workspaces = Vec::new();
    for label in labels {
        let workspace = registry.get(label)?;
        if !workspaces
            .iter()
            .any(|current| std::sync::Arc::ptr_eq(current, &workspace))
        {
            workspaces.push(workspace);
        }
    }
    Ok(workspaces)
}
/// Keep every authoritative buffer locked until the installer finishes. Hiding
/// acknowledged windows prevents new editor input during a native restart.
pub(crate) async fn with_flushed_windows<T, F>(app: &AppHandle, action: F) -> BackendResult<T>
where
    F: Future<Output = BackendResult<T>>,
{
    let gate = app.state::<super::lifecycle::LifecycleGate>();
    let _operation = gate.0.lock().await;
    app.state::<QuitState>()
        .0
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| {
            BackendError::new("APP_CLOSING", "Application shutdown is already in progress")
        })?;
    let registry = app.state::<WorkspaceRegistry>();
    if let Err(error) = registry.begin_shutdown() {
        app.state::<QuitState>().0.store(false, Ordering::Release);
        return Err(error);
    }
    let mut paused = PausedWindows::new(app);
    let mut labels = registry.labels()?;
    labels.sort();
    let windows = labels
        .iter()
        .filter_map(|label| crate::native_window::get(app, label))
        .collect::<Vec<_>>();
    futures_util::future::try_join_all(windows.iter().map(|window| request_renderer_flush(window)))
        .await?;
    paused.hide(&windows)?;
    let workspaces = unique_workspaces(&registry, &labels)?;
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
    app.state::<crate::settings::SettingsStore>()
        .save_window_sessions(&labels)
        .await?;
    action.await
}
pub(super) struct ClosingWindow {
    app: AppHandle,
    owner: String,
    committed: bool,
}
impl ClosingWindow {
    pub(super) fn begin(app: &AppHandle, owner: &str) -> BackendResult<Self> {
        if let Some(registry) = app.try_state::<WorkspaceRegistry>() {
            registry.begin_close(owner)?;
        }
        Ok(Self {
            app: app.clone(),
            owner: owner.into(),
            committed: false,
        })
    }
    pub(super) fn commit(&mut self) {
        self.committed = true;
    }
}
impl Drop for ClosingWindow {
    fn drop(&mut self) {
        let live = crate::native_window::get(&self.app, &self.owner).is_some()
            || crate::native_window::get(&self.app, &format!("opening-{}", self.owner)).is_some();
        if !self.committed
            && live
            && let Some(registry) = self.app.try_state::<WorkspaceRegistry>()
        {
            registry.cancel_close(&self.owner);
        }
    }
}
