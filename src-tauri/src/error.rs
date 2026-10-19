use serde::Serialize;

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[error("{message}")]
pub struct BackendError {
  pub code: String,
  pub message: String,
}

pub type BackendResult<T> = Result<T, BackendError>;

impl BackendError {
  pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
    Self {
      code: code.into(),
      message: message.into(),
    }
  }
}

impl From<std::io::Error> for BackendError {
  fn from(error: std::io::Error) -> Self {
    Self::new("IO_ERROR", error.to_string())
  }
}

impl From<sqlx::Error> for BackendError {
  fn from(error: sqlx::Error) -> Self {
    Self::new("DATABASE_ERROR", error.to_string())
  }
}

impl From<tauri::Error> for BackendError {
  fn from(error: tauri::Error) -> Self {
    Self::new("RUNTIME_ERROR", error.to_string())
  }
}

impl From<serde_json::Error> for BackendError {
  fn from(error: serde_json::Error) -> Self {
    Self::new("INVALID_REQUEST", error.to_string())
  }
}
