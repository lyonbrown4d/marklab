use super::startup::StartupState;
use crate::{
    error::{BackendError, BackendResult},
    settings::{PersistedValue, SettingsStore},
    workspace::WorkspaceRegistry,
};
use serde_json::Value;
use std::{path::PathBuf, sync::atomic::Ordering};
use tauri::{AppHandle, Manager};
pub fn start(app: &AppHandle) {
    if app
        .state::<StartupState>()
        .initializing
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = initialize(&app).await;
        if let Err(error) = result {
            log::error!("Desktop startup failed: {}", error.message);
            let _ = super::startup::failed(&app, "main", error.message).await;
        }
        let queued = app
            .state::<StartupState>()
            .finish_initialization()
            .unwrap_or_default();
        for (index, path) in queued.into_iter().enumerate() {
            let current = if index == 0 && !app.state::<StartupState>().interactive("main") {
                Some("main")
            } else {
                None
            };
            if let Err(error) = super::windows::open_target(&app, &path, current).await {
                log::warn!("Queued native open failed: {}", error.code);
            }
        }
    });
}
async fn initialize(app: &AppHandle) -> BackendResult<()> {
    let services = crate::composition::DesktopServices::open(app).await?;
    super::window_state::install(app).await?;
    let settings = &services.settings;
    let additional = settings.restore_sessions().await?;
    let saved = settings.read_session("main").await?;
    let locale = settings
        .read_setting("marklab.preferences")
        .await?
        .and_then(|value| {
            value
                .state
                .get("locale")
                .and_then(Value::as_str)
                .map(String::from)
        })
        .unwrap_or_else(|| std::env::var("LANG").unwrap_or_else(|_| "en-US".into()));
    let mut arguments = app.state::<super::cli::LaunchArguments>().0.clone();
    let argument = if arguments.is_empty() {
        None
    } else {
        Some(arguments.remove(0))
    };
    let mut native = app
        .state::<StartupState>()
        .native_paths
        .lock()
        .map_err(|_| BackendError::new("STARTUP_STATE_ERROR", "Native open queue is unavailable"))?
        .drain(..)
        .collect::<Vec<_>>();
    let native_first = if native.is_empty() {
        None
    } else {
        Some(native.remove(0))
    };
    let explicit = native_first.is_some() || argument.is_some();
    let saved_path = saved
        .as_ref()
        .and_then(|value| value.state.get("rootPath"))
        .and_then(Value::as_str)
        .map(String::from);
    let target = super::policy::choose_startup_target(native_first, argument, saved_path);
    services.publish(app);
    app.state::<StartupState>()
        .initialized
        .store(true, Ordering::Release);
    super::menus::install(app, &locale)?;
    app.state::<StartupState>().begin("main", target.clone())?;
    app.state::<WorkspaceRegistry>().allow_open("main")?;
    let use_internal = !explicit
        && saved
            .as_ref()
            .and_then(|value| value.state.get("rootKind"))
            .and_then(Value::as_str)
            == Some("internal");
    let single = match target.as_deref() {
        Some(path) => tokio::fs::metadata(path)
            .await
            .map(|metadata| metadata.is_file())
            .unwrap_or(false),
        None => false,
    };
    let bound = super::windows::bind(
        app,
        "main",
        if use_internal {
            None
        } else {
            target.as_deref()
        },
        single,
    )
    .await;
    let workspace = match bound {
        Ok(workspace) => workspace,
        Err(error) if !explicit => {
            log::warn!("Saved workspace unavailable: {}", error.code);
            super::windows::bind(app, "main", None, false).await?;
            app.state::<WorkspaceRegistry>().get("main")?
        }
        Err(error) => {
            super::windows::bind(app, "main", None, false).await?;
            app.state::<StartupState>()
                .initialized
                .store(true, Ordering::Release);
            super::startup::failed(app, "main", error.message.clone()).await?;
            return Ok(());
        }
    };
    let root = workspace.root_info();
    if root.kind == "internal" {
        seed_internal(app, &locale).await?;
    }
    let mut seed = if explicit {
        PersistedValue::default()
    } else {
        saved.unwrap_or_default()
    };
    let matches = seed.state.get("rootPath").and_then(Value::as_str) == Some(root.path.as_str())
        && seed.state.get("rootKind").and_then(Value::as_str) == Some(root.kind.as_str());
    if !matches {
        seed.state.insert("tabs".into(), serde_json::json!([]));
        seed.state.insert("activeTabId".into(), Value::Null);
    }
    seed.state
        .insert("rootPath".into(), Value::String(root.path.clone()));
    seed.state
        .insert("rootKind".into(), Value::String(root.kind));
    app.state::<SettingsStore>()
        .write_session("main", seed, Some(true), explicit)
        .await?;
    let attempt = app.state::<StartupState>().begin("main", Some(root.path))?;
    super::windows::create(app, "main", None).await?;
    super::startup::schedule_timeout(app, "main", attempt);
    app.state::<StartupState>()
        .initialized
        .store(true, Ordering::Release);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for seed in additional {
            if let Err(error) = super::windows::restore_window(&app, seed).await {
                log::warn!("Additional workspace restore failed: {}", error.code);
            }
        }
        arguments.extend(native);
        for path in arguments {
            let _ = super::windows::open_target(&app, &path, None).await;
        }
    });
    Ok(())
}
pub async fn reopen(app: &AppHandle) -> BackendResult<()> {
    let gate = app.state::<super::lifecycle::LifecycleGate>();
    let _operation = gate.0.lock().await;
    if !super::startup::initialized(app) {
        start(app);
        return Ok(());
    }
    app.state::<WorkspaceRegistry>().allow_open("main")?;
    let settings = app.state::<SettingsStore>();
    settings.restore_sessions().await?;
    let seed = settings.read_session("main").await?.unwrap_or_default();
    let path = seed.state.get("rootPath").and_then(Value::as_str);
    let single = seed.state.get("rootKind").and_then(Value::as_str) == Some("single");
    let internal = seed.state.get("rootKind").and_then(Value::as_str) == Some("internal");
    super::windows::bind(app, "main", if internal { None } else { path }, single).await?;
    app.state::<StartupState>()
        .begin("main", path.map(String::from))?;
    super::windows::create(app, "main", None).await?;
    Ok(())
}
pub(super) async fn seed_internal(app: &AppHandle, locale: &str) -> BackendResult<()> {
    let data = crate::composition::AppPaths::resolve(app).await?.data_dir;
    let mut resources = app.path().resource_dir()?.join("workspace-guide");
    #[cfg(debug_assertions)]
    {
        if tokio::fs::metadata(&resources).await.is_err() {
            resources =
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/workspace-guide");
        }
    }
    crate::workspace::guide::initialize(data, resources, locale.to_string()).await
}
