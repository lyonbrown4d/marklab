mod commands;
mod install;
pub use install::install_if_scheduled;
mod types;
use crate::error::{BackendError, BackendResult};
pub use commands::*;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;
pub use types::*;

pub struct UpdateService {
    state: Mutex<UpdateState>,
    operation: Mutex<()>,
    available: Mutex<Option<Update>>,
    artifact: Mutex<Option<PathBuf>>,
    configured: bool,
}

impl UpdateService {
    pub fn new(app: &AppHandle) -> Self {
        let configured = app.config().plugins.0.get("updater").is_some_and(|config| {
            config
                .get("pubkey")
                .and_then(|v| v.as_str())
                .is_some_and(|s| !s.is_empty())
                && config
                    .get("endpoints")
                    .and_then(|v| v.as_array())
                    .is_some_and(|a| !a.is_empty())
        });
        Self {
            state: Mutex::new(UpdateState::new(
                app.package_info().version.to_string(),
                configured,
            )),
            operation: Mutex::new(()),
            available: Mutex::new(None),
            artifact: Mutex::new(None),
            configured,
        }
    }

    async fn publish(&self, app: &AppHandle, event: &str) -> BackendResult<UpdateResult> {
        let state = self.state.lock().await.clone();
        app.emit(
            "updates-event",
            UpdateEvent {
                state: state.clone(),
                event: event.into(),
            },
        )?;
        Ok(UpdateResult {
            ok: state.error.is_none(),
            state,
        })
    }

    async fn failure(
        &self,
        app: &AppHandle,
        code: &str,
        operation: &str,
        message: String,
    ) -> BackendResult<UpdateResult> {
        let mut state = self.state.lock().await;
        state.status = if code == "UNAVAILABLE" {
            "unavailable"
        } else {
            "error"
        }
        .into();
        state.error = Some(UpdateError {
            code: code.into(),
            operation: operation.into(),
            message,
        });
        drop(state);
        self.publish(
            app,
            if code == "UNAVAILABLE" {
                "unavailable"
            } else {
                "error"
            },
        )
        .await
    }

    pub async fn check(&self, app: &AppHandle) -> BackendResult<UpdateResult> {
        let _operation = self.operation.try_lock().map_err(|_| {
            BackendError::new("UPDATE_BUSY", "An update operation is already running")
        })?;
        if !self.configured {
            return self
                .failure(
                    app,
                    "UNAVAILABLE",
                    "availability",
                    "Signed Tauri updates are not configured for this build.".into(),
                )
                .await;
        }
        if matches!(
            self.state.lock().await.status.as_str(),
            "downloaded" | "installing"
        ) {
            return self.publish(app, "downloaded").await;
        }
        {
            let mut state = self.state.lock().await;
            state.status = "checking".into();
            state.error = None;
            state.info = None;
            state.progress = None;
        }
        self.publish(app, "checking").await?;
        let result = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        };
        match result {
            Ok(update) => {
                let mut state = self.state.lock().await;
                state.status = if update.is_some() {
                    "available"
                } else {
                    "not-available"
                }
                .into();
                state.info = update.as_ref().map(|u| UpdateInfo {
                    version: u.version.clone(),
                    release_notes: u.body.clone(),
                    release_date: u.date.map(|d| d.to_string()),
                });
                let event = state.status.clone();
                drop(state);
                *self.available.lock().await = update;
                self.publish(app, &event).await
            }
            Err(error) => {
                self.failure(app, "CHECK_FAILED", "check", error.to_string())
                    .await
            }
        }
    }

    pub async fn download(&self, app: &AppHandle) -> BackendResult<UpdateResult> {
        let _operation = self.operation.try_lock().map_err(|_| {
            BackendError::new("UPDATE_BUSY", "An update operation is already running")
        })?;
        let update = self.available.lock().await.clone().ok_or_else(|| {
            BackendError::new("NOT_READY", "Check for an update before downloading")
        })?;
        if update.download_url.scheme() != "https" {
            return self
                .failure(
                    app,
                    "DOWNLOAD_FAILED",
                    "download",
                    "Update downloads require HTTPS.".into(),
                )
                .await;
        }
        {
            let mut state = self.state.lock().await;
            state.status = "downloading".into();
            state.error = None;
        }
        let started = std::time::Instant::now();
        let mut transferred = 0u64;
        let mut last_event = std::time::Instant::now();
        let owner = app.clone();
        let bytes = update
            .download(
                |chunk, total| {
                    transferred = transferred.saturating_add(chunk as u64);
                    if last_event.elapsed() < std::time::Duration::from_millis(100) {
                        return;
                    }
                    last_event = std::time::Instant::now();
                    let total = total.unwrap_or(0);
                    let progress = UpdateProgress {
                        transferred,
                        total,
                        percent: if total > 0 {
                            (100.0 * transferred as f64 / total as f64).min(100.0)
                        } else {
                            0.0
                        },
                        bytes_per_second: transferred as f64
                            / started.elapsed().as_secs_f64().max(0.001),
                    };
                    if let Ok(mut state) = self.state.try_lock() {
                        state.progress = Some(progress.clone());
                        let _ = owner.emit(
                            "updates-event",
                            UpdateEvent {
                                state: state.clone(),
                                event: "download-progress".into(),
                            },
                        );
                    }
                },
                || {},
            )
            .await;
        let bytes = match bytes {
            Ok(bytes) => bytes,
            Err(error) => {
                return self
                    .failure(app, "DOWNLOAD_FAILED", "download", error.to_string())
                    .await;
            }
        };
        // The official plugin verifies signatures before returning bytes. Cache on disk
        // so the downloaded application does not remain resident until next launch.
        let directory = app.path().app_cache_dir()?.join("updates");
        tokio::fs::create_dir_all(&directory).await?;
        let path = directory.join(format!("{}.update", uuid::Uuid::new_v4()));
        tokio::fs::write(&path, &bytes).await?;
        drop(bytes);
        if let Some(previous) = self.artifact.lock().await.replace(path) {
            let _ = tokio::fs::remove_file(previous).await;
        }
        self.state.lock().await.status = "downloaded".into();
        self.publish(app, "downloaded").await
    }
}
