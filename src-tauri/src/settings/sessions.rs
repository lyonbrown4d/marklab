use super::types::*;
use super::{PersistedValue, SettingsStore, persisted_decode_error};
use crate::error::BackendResult;
use serde_json::Value;
use sqlx::types::Json;

impl SettingsStore {
  pub async fn read_session(&self, session: &str) -> BackendResult<Option<PersistedValue>> {
    let row = sqlx::query_as::<_, (Json<serde_json::Map<String, Value>>, Option<i64>)>(
      "SELECT value_json,version FROM window_sessions WHERE id=?",
    )
    .bind(session)
    .fetch_optional(&self.pool)
    .await
    .map_err(persisted_decode_error)?;
    Ok(row.map(|(Json(state), version)| PersistedValue { state, version }))
  }
  /// Lifecycle callers may select a newly opened workspace; background window saves do not select it.
  pub async fn write_session(
    &self,
    session: &str,
    mut value: PersistedValue,
    select: Option<bool>,
    update_recents: bool,
  ) -> BackendResult<()> {
    let _guard = self.mutation.lock().await;
    normalize_workspace(&mut value);
    if let Some(path) = root_path(&value) {
      crate::database::workspace_key(
        value
          .state
          .get("rootKind")
          .and_then(Value::as_str)
          .unwrap_or("internal"),
        path,
      )?;
    }
    let previous = self.read_session(session).await?;
    let changed = previous.as_ref().is_none_or(|old| {
      old.state.get("rootPath") != value.state.get("rootPath")
        || old.state.get("rootKind") != value.state.get("rootKind")
    });
    let mut selected = self.selected.lock().await;
    let remember =
      root_path(&value).is_some() && select.unwrap_or(changed || selected.as_str() == session);
    let mut transaction = self.pool.begin().await?;
    sqlx::query("INSERT INTO window_sessions(id,value_json,version) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,version=excluded.version")
            .bind(session).bind(Json(&value.state)).bind(value.version.unwrap_or(1)).execute(&mut *transaction).await?;
    if let Some(path) = root_path(&value)
      && (update_recents || select == Some(true))
    {
      super::recents::record_recent(&mut transaction, path, changed || select == Some(true))
        .await?;
    }
    if remember {
      sqlx::query("INSERT INTO settings(key,value_json,version) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=excluded.version")
                .bind(LAST_WORKSPACE).bind(Json(&value.state)).bind(value.version.unwrap_or(1)).execute(&mut *transaction).await?;
    }
    transaction.commit().await?;
    if remember {
      *selected = session.into();
    }
    Ok(())
  }
  pub async fn copy_session(
    &self,
    source: &str,
    target: &str,
    overrides: serde_json::Map<String, Value>,
  ) -> BackendResult<PersistedValue> {
    let mut value = self.read_session(source).await?.unwrap_or_default();
    value.state.extend(overrides);
    self
      .write_session(target, value.clone(), Some(true), false)
      .await?;
    Ok(value)
  }
  pub async fn remove_session(&self, session: &str) -> BackendResult<()> {
    let _guard = self.mutation.lock().await;
    if session != "main" {
      sqlx::query("DELETE FROM window_sessions WHERE id=?")
        .bind(session)
        .execute(&self.pool)
        .await?;
    }
    Ok(())
  }
  /// Save all open windows before exit. The selected window is restored into `main` first.
  pub async fn save_window_sessions(&self, session_ids: &[String]) -> BackendResult<()> {
    let _guard = self.mutation.lock().await;
    let selected = self.selected.lock().await.clone();
    let mut ids = session_ids.to_vec();
    ids.sort_by_key(|id| id == &selected);
    let mut sessions = Vec::new();
    for id in ids {
      if let Some(value) = self.read_session(&id).await?
        && root_path(&value).is_some()
      {
        sessions.push(value);
      }
    }
    self
      .write_setting(
        WORKSPACE_WINDOWS,
        &PersistedValue {
          state: serde_json::json!({"sessions":sessions})
            .as_object()
            .cloned()
            .unwrap_or_default(),
          version: Some(1),
        },
      )
      .await
  }
  /// Called only by native startup. Returns additional windows to create; main is seeded here.
  pub async fn restore_sessions(&self) -> BackendResult<Vec<PersistedValue>> {
    let _guard = self.mutation.lock().await;
    let saved = self.read_setting(WORKSPACE_WINDOWS).await?;
    let mut sessions: Vec<PersistedValue> = saved
      .and_then(|value| value.state.get("sessions").cloned())
      .and_then(|value| value.as_array().cloned())
      .unwrap_or_default()
      .into_iter()
      .filter_map(|value| serde_json::from_value(value).ok())
      .filter(|value| root_path(value).is_some())
      .collect();
    let value = match sessions.pop() {
      Some(value) => Some(value),
      None => self.read_setting(LAST_WORKSPACE).await?,
    };
    if let Some(value) = value.filter(|value| root_path(value).is_some()) {
      let mut value = value;
      normalize_workspace(&mut value);
      let mut transaction = self.pool.begin().await?;
      sqlx::query("INSERT INTO window_sessions(id,value_json,version) VALUES('main',?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,version=excluded.version")
                .bind(Json(&value.state)).bind(value.version.unwrap_or(1)).execute(&mut *transaction).await?;
      sqlx::query("INSERT INTO settings(key,value_json,version) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=excluded.version")
                .bind(LAST_WORKSPACE).bind(Json(&value.state)).bind(value.version.unwrap_or(1)).execute(&mut *transaction).await?;
      sqlx::query("DELETE FROM settings WHERE key=?")
        .bind(WORKSPACE_WINDOWS)
        .execute(&mut *transaction)
        .await?;
      transaction.commit().await?;
      *self.selected.lock().await = "main".into();
    }
    Ok(sessions)
  }
}
