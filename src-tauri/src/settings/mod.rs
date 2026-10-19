mod commands;
mod recents;
mod sessions;
#[cfg(test)]
mod tests;
mod types;
use crate::error::{BackendError, BackendResult};
pub use commands::*;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use types::*;
pub use types::{PersistResult, PersistedValue, RecentWorkspace, WindowState};

pub struct SettingsStore {
  pub(crate) pool: SqlitePool,
  // Serializes read/modify/write session selection and removed-recent history updates.
  pub(crate) mutation: tokio::sync::Mutex<()>,
  pub(crate) selected: tokio::sync::Mutex<String>,
}
impl SettingsStore {
  pub fn new(pool: SqlitePool) -> Self {
    Self {
      pool,
      mutation: tokio::sync::Mutex::new(()),
      selected: tokio::sync::Mutex::new("main".into()),
    }
  }
  pub async fn get(&self, key: &str, session: &str) -> BackendResult<Option<PersistedValue>> {
    allowed_keys(key)?;
    if key != WORKSPACE {
      return self.read_setting(key).await;
    }
    let value = self.read_session(session).await?;
    let paths = self.recent_paths().await?;
    if value.is_none() && paths.is_empty() {
      return Ok(None);
    }
    let mut value = value.unwrap_or_default();
    if !paths.is_empty() {
      value
        .state
        .insert("recentProjects".into(), serde_json::json!(paths));
    }
    Ok(Some(value))
  }
  pub async fn set(&self, key: &str, session: &str, value: Value) -> BackendResult<()> {
    let keys = allowed_keys(key)?;
    if value.is_null() {
      return self.remove(key, session).await;
    }
    let mut parsed: PersistedValue = serde_json::from_value(value)
      .map_err(|error| BackendError::new("invalid_settings", error.to_string()))?;
    if serde_json::to_vec(&parsed).map_err(json_error)?.len() > 2 * 1024 * 1024 {
      return Err(BackendError::new(
        "settings_too_large",
        "Settings payload exceeds 2 MiB",
      ));
    }
    if key == WORKSPACE {
      return self.write_session(session, parsed, None, true).await;
    }
    parsed.state.retain(|key, _| keys.contains(&key.as_str()));
    self.write_setting(key, &parsed).await
  }
  pub async fn remove(&self, key: &str, session: &str) -> BackendResult<()> {
    allowed_keys(key)?;
    if key == WORKSPACE {
      self.remove_session(session).await
    } else {
      sqlx::query("DELETE FROM settings WHERE key=?")
        .bind(key)
        .execute(&self.pool)
        .await?;
      Ok(())
    }
  }
  pub async fn read_setting(&self, key: &str) -> BackendResult<Option<PersistedValue>> {
    let row = sqlx::query("SELECT value_json,version FROM settings WHERE key=?")
      .bind(key)
      .fetch_optional(&self.pool)
      .await?;
    row
      .map(|row| {
        Ok(PersistedValue {
          state: serde_json::from_str(row.get("value_json")).map_err(json_error)?,
          version: row.get("version"),
        })
      })
      .transpose()
  }
  pub async fn write_setting(&self, key: &str, value: &PersistedValue) -> BackendResult<()> {
    sqlx::query("INSERT INTO settings(key,value_json,version) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=excluded.version")
            .bind(key).bind(serde_json::to_string(&value.state).map_err(json_error)?).bind(value.version).execute(&self.pool).await?;
    Ok(())
  }
  pub async fn get_window_state(&self, id: &str) -> BackendResult<Option<WindowState>> {
    let value: Option<String> =
      sqlx::query_scalar("SELECT value_json FROM window_state WHERE window_id=?")
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
    value
      .map(|value| serde_json::from_str(&value).map_err(json_error))
      .transpose()
  }
  pub async fn set_window_state(&self, id: &str, value: &WindowState) -> BackendResult<()> {
    if value.width == 0 || value.height == 0 {
      return Err(BackendError::new(
        "invalid_window_state",
        "Window dimensions must be positive",
      ));
    }
    sqlx::query("INSERT INTO window_state(window_id,value_json) VALUES(?,?) ON CONFLICT(window_id) DO UPDATE SET value_json=excluded.value_json")
            .bind(id).bind(serde_json::to_string(value).map_err(json_error)?).execute(&self.pool).await?;
    Ok(())
  }
}
pub(crate) fn json_error(error: serde_json::Error) -> BackendError {
  BackendError::new("invalid_persisted_data", error.to_string())
}
