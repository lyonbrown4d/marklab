use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
  pub current_version: String,
  pub install_on_quit: bool,
  pub status: String,
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
      status: if configured { "idle" } else { "unavailable" }.into(),
      error: if configured {
        None
      } else {
        Some(UpdateError {
          code: "UNAVAILABLE".into(),
          operation: "availability".into(),
          message: "Signed Tauri updates are not configured for this build.".into(),
        })
      },
      info: None,
      progress: None,
    }
  }
}
#[derive(Clone, Serialize)]
pub struct UpdateError {
  pub code: String,
  pub operation: String,
  pub message: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub version: String,
  pub release_notes: Option<String>,
  pub release_date: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
  pub transferred: u64,
  pub total: u64,
  pub percent: f64,
  pub bytes_per_second: f64,
}
#[derive(Serialize)]
pub struct UpdateResult {
  pub ok: bool,
  #[serde(flatten)]
  pub state: UpdateState,
}
#[derive(Clone, Serialize)]
pub struct UpdateEvent {
  pub event: String,
  #[serde(flatten)]
  pub state: UpdateState,
}
