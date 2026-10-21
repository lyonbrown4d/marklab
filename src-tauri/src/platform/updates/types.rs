#[path = "state_types.rs"]
mod state_types;
use serde::Serialize;
pub use state_types::*;

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
  pub current_version: String,
  pub install_on_quit: bool,
  pub status: UpdateStatus,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<UpdateError>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub info: Option<UpdateInfo>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub progress: Option<UpdateProgress>,
}
impl UpdateState {
  pub fn new(version: String, configured: bool) -> Self {
    Self {
      current_version: version,
      install_on_quit: false,
      status: if configured {
        UpdateStatus::Idle
      } else {
        UpdateStatus::Unavailable
      },
      error: if configured {
        None
      } else {
        Some(UpdateError {
          code: UpdateErrorCode::Unavailable,
          operation: UpdateOperation::Availability,
          message: "Signed Tauri updates are not configured for this build.".into(),
        })
      },
      info: None,
      progress: None,
    }
  }
}
#[derive(Clone, Serialize, specta::Type)]
pub struct UpdateError {
  pub code: UpdateErrorCode,
  pub operation: UpdateOperation,
  pub message: String,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub version: String,
  pub release_notes: Option<String>,
  pub release_date: Option<String>,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub transferred: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub total: u64,
  pub percent: f64,
  pub bytes_per_second: f64,
}
pub use PlatformUpdateResult as UpdateResult;
#[derive(Serialize, specta::Type)]
pub struct PlatformUpdateResult {
  pub ok: bool,
  #[serde(flatten)]
  pub state: UpdateState,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct UpdateEvent {
  pub event: UpdateEventKind,
  #[serde(flatten)]
  pub state: UpdateState,
}
