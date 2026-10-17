use super::windows::{bind, create, ensure_opening};
use crate::{
    error::{BackendError, BackendResult},
    settings::{PersistedValue, SettingsStore},
    workspace::WorkspaceRegistry,
};
use serde_json::Value;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
pub async fn restore_window(app: &AppHandle, seed: PersistedValue) -> BackendResult<String> {
    let gate = app.state::<super::lifecycle::LifecycleGate>();
    let _operation = gate.0.lock().await;
    let label = format!("workspace-{}", uuid::Uuid::new_v4());
    let path = seed
        .state
        .get("rootPath")
        .and_then(Value::as_str)
        .map(String::from);
    let single = seed.state.get("rootKind").and_then(Value::as_str) == Some("single");
    app.state::<super::startup::StartupState>()
        .begin(&label, path.clone())?;
    app.state::<WorkspaceRegistry>().allow_open(&label)?;
    ensure_opening(app, &label)?;
    let target = if seed.state.get("rootKind").and_then(Value::as_str) == Some("internal") {
        None
    } else {
        path.as_deref()
    };
    let result: BackendResult<String> = async {
        bind(app, &label, target, single).await?;
        app.state::<SettingsStore>()
            .write_session(&label, seed, Some(false), false)
            .await?;
        create(app, &label, None).await?;
        Ok(label.clone())
    }
    .await;
    if let Err(error) = &result {
        super::startup::failed(app, &label, error.message.clone()).await?;
    }
    result
}
pub async fn open_target(
    app: &AppHandle,
    path: &str,
    current: Option<&str>,
) -> BackendResult<String> {
    let gate = app.state::<super::lifecycle::LifecycleGate>();
    let _operation = gate.0.lock().await;
    if path.contains('\0') || !Path::new(path).is_absolute() {
        return Err(BackendError::new(
            "INVALID_PATH",
            "Native open path must be absolute",
        ));
    }
    let label = current
        .map(String::from)
        .unwrap_or_else(|| format!("workspace-{}", uuid::Uuid::new_v4()));
    let previous_boot = app.state::<super::startup::StartupState>().boot(&label)?;
    let was_interactive = app
        .state::<super::startup::StartupState>()
        .interactive(&label);
    if was_interactive && let Some(window) = crate::native_window::get(app, &label) {
        super::lifecycle::request_renderer_flush(&window).await?;
        super::geometry::persist(&window).await?;
    }
    app.state::<super::startup::StartupState>()
        .begin(&label, Some(path.into()))?;
    ensure_opening(app, &label)?;
    if let Some(window) = crate::native_window::get(app, &label) {
        window.hide()?;
    }
    let mut switched = false;
    let result: BackendResult<String> = async {
        let metadata = tokio::fs::metadata(path).await?;
        if !metadata.is_file() && !metadata.is_dir() { return Err(BackendError::new("INVALID_PATH", "Open target is not a file or directory")); }
        let workspace = super::windows::bind_root(app, &label, Some(path), metadata.is_file()).await?;
        // Binding is committed before watcher setup; later failures must keep the new root hidden.
        switched = true;
        app.state::<WorkspaceRegistry>().start_watcher(&label, app.clone()).await?;
        super::lifecycle::cleanup_window(app, &label).await?;
        app.state::<crate::terminal::TerminalState>().reopen_window(&label)?;
        let root = workspace.root_info();
        let seed = PersistedValue {
            state: serde_json::json!({"rootPath":root.path,"rootKind":root.kind,"tabs":[],"activeTabId":null}).as_object().cloned().unwrap_or_default(),
            ..PersistedValue::default()
        };
        app.state::<SettingsStore>().write_session(&label, seed.clone(), Some(true), true).await?;
        if let Some(window) = crate::native_window::get(app, &label) {
            super::geometry::activate(&window, &root).await?;
            window.emit("workspace-session-seed", super::startup::seed(app, &label, seed)?)?;
            let revision = workspace.current_revision();
            let delta = serde_json::json!({"kind":"invalidated","root":root,"generation":workspace.generation,"previousRevision":revision,"revision":revision});
            window.emit("fs-changed", &delta)?; window.emit("workspace-tree-changed", &delta)?;
            if let Some(boot) = app.state::<super::startup::StartupState>().boot(&label)? { super::startup::schedule_timeout(app, &label, boot.attempt); }
        } else { create(app, &label, None).await?; }
        Ok(label.clone())
    }.await;
    if let Err(error) = &result {
        if was_interactive && !switched {
            if let Some(previous) = previous_boot {
                app.state::<super::startup::StartupState>()
                    .boots
                    .lock()
                    .map_err(|_| {
                        BackendError::new("STATE_ERROR", "Window startup state is unavailable")
                    })?
                    .insert(label.clone(), previous);
            }
            if let Some(window) = crate::native_window::get(app, &label) {
                window.show()?;
                window.set_focus()?;
            }
            if let Some(opening) = crate::native_window::get(app, &format!("opening-{label}")) {
                opening.destroy()?;
            }
        } else {
            super::startup::failed(app, &label, error.message.clone()).await?;
        }
    }
    result
}
