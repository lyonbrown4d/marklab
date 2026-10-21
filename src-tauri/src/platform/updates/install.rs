use super::{
  UpdateErrorCode, UpdateEventKind, UpdateOperation, UpdateResult, UpdateService, UpdateStatus,
};
use crate::error::{BackendError, BackendResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::Update;

impl UpdateService {
  pub async fn install(&self, app: &AppHandle, flush: bool) -> BackendResult<UpdateResult> {
    let _operation = self
      .operation
      .try_lock()
      .map_err(|_| BackendError::new("UPDATE_BUSY", "An update operation is already running"))?;
    let update = self
      .available
      .lock()
      .await
      .clone()
      .ok_or_else(|| BackendError::new("NOT_READY", "No downloaded update is available"))?;
    let path = self
      .artifact
      .lock()
      .await
      .clone()
      .ok_or_else(|| BackendError::new("NOT_READY", "Download the update before installing"))?;
    if flush {
      crate::desktop::with_flushed_windows(app, self.install_ready(app, update, path)).await
    } else {
      self.install_ready(app, update, path).await
    }
  }

  async fn install_ready(
    &self,
    app: &AppHandle,
    update: Update,
    path: PathBuf,
  ) -> BackendResult<UpdateResult> {
    self.state.lock().await.status = UpdateStatus::Installing;
    self.publish(app, UpdateEventKind::Installing).await?;
    let result = crate::blocking::run(move || {
      let bytes = std::fs::read(&path)?;
      update
        .install(&bytes)
        .map_err(|e| BackendError::new("INSTALL_FAILED", e.to_string()))?;
      let _ = std::fs::remove_file(path);
      Ok(())
    })
    .await;
    if let Err(error) = result {
      return self
        .failure(
          app,
          UpdateErrorCode::InstallFailed,
          UpdateOperation::Install,
          error.message,
        )
        .await;
    }
    self.publish(app, UpdateEventKind::Installing).await?;
    app.restart()
  }
}

pub async fn install_if_scheduled(app: &AppHandle) -> BackendResult<bool> {
  let service = app.state::<UpdateService>();
  let scheduled = service.state.lock().await.install_on_quit;
  if scheduled {
    let result = service.install(app, false).await?;
    if !result.ok {
      return Err(BackendError::new(
        "INSTALL_FAILED",
        "The scheduled update could not be installed",
      ));
    }
    return Ok(true);
  }
  Ok(false)
}
