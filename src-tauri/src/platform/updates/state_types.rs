use serde::Serialize;
#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateStatus {
  Idle,
  Checking,
  Available,
  NotAvailable,
  Downloading,
  Downloaded,
  Installing,
  Error,
  Unavailable,
}
impl UpdateStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Idle => "idle",
      Self::Checking => "checking",
      Self::Available => "available",
      Self::NotAvailable => "not-available",
      Self::Downloading => "downloading",
      Self::Downloaded => "downloaded",
      Self::Installing => "installing",
      Self::Error => "error",
      Self::Unavailable => "unavailable",
    }
  }
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateEventKind {
  Idle,
  Checking,
  Available,
  NotAvailable,
  Downloading,
  Downloaded,
  Installing,
  Error,
  Unavailable,
  DownloadProgress,
  InstallOnQuitChanged,
}
impl From<UpdateStatus> for UpdateEventKind {
  fn from(status: UpdateStatus) -> Self {
    match status {
      UpdateStatus::Idle => Self::Idle,
      UpdateStatus::Checking => Self::Checking,
      UpdateStatus::Available => Self::Available,
      UpdateStatus::NotAvailable => Self::NotAvailable,
      UpdateStatus::Downloading => Self::Downloading,
      UpdateStatus::Downloaded => Self::Downloaded,
      UpdateStatus::Installing => Self::Installing,
      UpdateStatus::Error => Self::Error,
      UpdateStatus::Unavailable => Self::Unavailable,
    }
  }
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum UpdateErrorCode {
  CheckFailed,
  DownloadFailed,
  InstallFailed,
  InvalidRequest,
  NotReady,
  Unavailable,
}
#[derive(Clone, Copy, Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateOperation {
  Availability,
  Check,
  Download,
  Install,
  InstallOnQuit,
}
