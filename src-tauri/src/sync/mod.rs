mod commands;
mod config;
mod domain;
pub use domain::*;
pub mod conflicts;
pub mod engine;
mod events;
pub(crate) mod paths;
mod profiles;
pub mod remote;
#[cfg(test)]
mod tests;
mod types;
use crate::{
  database::workspace_key,
  error::{BackendError, BackendResult},
  workspace::RootInfo,
};
pub use commands::*;
use sqlx::SqlitePool;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{Mutex, RwLock};
use tokio_util::sync::CancellationToken;
pub use types::*;
#[derive(Clone)]
pub struct SyncService {
  pub(crate) inner: Arc<Inner>,
}
pub(crate) struct Inner {
  pub pool: SqlitePool,
  pub configuration: RwLock<()>,
  pub sessions: Mutex<HashMap<String, String>>,
  pub runs: Mutex<HashMap<String, Run>>,
}
pub(crate) struct Run {
  pub owner: String,
  pub request_id: String,
  pub cancel: CancellationToken,
}
impl SyncService {
  pub async fn new(pool: SqlitePool) -> BackendResult<Self> {
    sqlx::raw_sql("CREATE TABLE IF NOT EXISTS webdav_profiles(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,secret_ref TEXT); CREATE TABLE IF NOT EXISTS sync_channels(workspace_key TEXT PRIMARY KEY,value_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sync_states(workspace_key TEXT PRIMARY KEY,value_json TEXT NOT NULL);").execute(&pool).await?;
    Ok(Self {
      inner: Arc::new(Inner {
        pool,
        configuration: RwLock::new(()),
        sessions: Mutex::new(HashMap::new()),
        runs: Mutex::new(HashMap::new()),
      }),
    })
  }
  pub fn workspace_key(root: &RootInfo) -> BackendResult<String> {
    if root.kind == crate::workspace::RootKind::Single {
      return Err(BackendError::new(
        "SYNC_SINGLE_FILE",
        "Sync is unavailable in single-file mode",
      ));
    }
    workspace_key("external", &root.path)
  }
  pub async fn load_state(&self, root: &RootInfo) -> BackendResult<Option<SyncState>> {
    let value: Option<String> =
      sqlx::query_scalar("SELECT value_json FROM sync_states WHERE workspace_key=?")
        .bind(Self::workspace_key(root)?)
        .fetch_optional(&self.inner.pool)
        .await?;
    value
      .map(|value| serde_json::from_str(&value).map_err(BackendError::from))
      .transpose()
  }
  pub async fn save_state(&self, root: &RootInfo, state: &SyncState) -> BackendResult<()> {
    sqlx::query("INSERT INTO sync_states(workspace_key,value_json) VALUES(?,?) ON CONFLICT(workspace_key) DO UPDATE SET value_json=excluded.value_json").bind(Self::workspace_key(root)?).bind(serde_json::to_string(state)?).execute(&self.inner.pool).await?;
    Ok(())
  }
  pub async fn device_id(&self) -> BackendResult<String> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT OR IGNORE INTO settings(key,value_json,version) VALUES('marklab.sync-device-id',?,1)",
    )
    .bind(serde_json::to_string(&id)?)
    .execute(&self.inner.pool)
    .await?;
    let value: String =
      sqlx::query_scalar("SELECT value_json FROM settings WHERE key='marklab.sync-device-id'")
        .fetch_one(&self.inner.pool)
        .await?;
    let id: String = serde_json::from_str(&value)?;
    uuid::Uuid::parse_str(&id)
      .map_err(|_| BackendError::new("SYNC_ID_INVALID", "Invalid stored sync device identity"))?;
    Ok(id)
  }
  pub async fn remote(&self, channel: &Channel) -> BackendResult<remote::DavRemote> {
    let (profile, reference) = self.stored_profile(&channel.profile_id).await?;
    let password = if profile.session_only {
      self.inner.sessions.lock().await.get(&profile.id).cloned()
    } else if let Some(reference) = reference {
      Some(crate::ai::secrets::read(&reference).await?)
    } else {
      None
    };
    remote::DavRemote::new(&profile, password.as_deref(), &channel.remote_root)
  }
  pub async fn cancel_owner(&self, owner: &str) {
    let runs = self.inner.runs.lock().await;
    for run in runs.values() {
      if run.owner == owner {
        run.cancel.cancel();
      }
    }
  }
}
