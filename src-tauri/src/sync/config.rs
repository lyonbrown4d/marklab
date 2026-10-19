use super::{Channel, Channels, SyncService, paths};
use crate::{
  error::{BackendError, BackendResult},
  workspace::RootInfo,
};
impl SyncService {
  pub async fn channel(&self, root: &RootInfo) -> BackendResult<Option<Channel>> {
    let value: Option<String> =
      sqlx::query_scalar("SELECT value_json FROM sync_channels WHERE workspace_key=?")
        .bind(Self::workspace_key(root)?)
        .fetch_optional(&self.inner.pool)
        .await?;
    value
      .map(|value| serde_json::from_str(&value).map_err(BackendError::from))
      .transpose()
  }
  pub async fn set_channel(
    &self,
    root: &RootInfo,
    mut channel: Channel,
  ) -> BackendResult<Channels> {
    if channel.provider != "webdav"
      || !channel.remote_root.starts_with('/')
      || channel.remote_root.len() > 2048
    {
      return Err(paths::invalid("Invalid WebDAV channel"));
    }
    paths::identifier(&channel.profile_id, 128)?;
    let relative = paths::remote_path(&channel.remote_root)?;
    channel.remote_root = if relative.is_empty() {
      "/".into()
    } else {
      format!("/{relative}")
    };
    let _configuration = self.inner.configuration.write().await;
    self.stored_profile(&channel.profile_id).await?;
    let previous = self.channel(root).await?;
    let changed = previous.is_some_and(|previous| {
      previous.profile_id != channel.profile_id || previous.remote_root != channel.remote_root
    });
    let mut transaction = self.inner.pool.begin().await?;
    sqlx::query("INSERT INTO sync_channels(workspace_key,value_json) VALUES(?,?) ON CONFLICT(workspace_key) DO UPDATE SET value_json=excluded.value_json").bind(Self::workspace_key(root)?).bind(serde_json::to_string(&channel)?).execute(&mut *transaction).await?;
    // A baseline belongs to a remote binding. Never apply one remote's deletions to another.
    if changed {
      sqlx::query("DELETE FROM sync_states WHERE workspace_key=?")
        .bind(Self::workspace_key(root)?)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(Channels {
      webdav: Some(channel),
    })
  }
  pub async fn remove_channel(&self, root: &RootInfo) -> BackendResult<Channels> {
    let _configuration = self.inner.configuration.write().await;
    let key = Self::workspace_key(root)?;
    let mut transaction = self.inner.pool.begin().await?;
    sqlx::query("DELETE FROM sync_channels WHERE workspace_key=?")
      .bind(&key)
      .execute(&mut *transaction)
      .await?;
    sqlx::query("DELETE FROM sync_states WHERE workspace_key=?")
      .bind(&key)
      .execute(&mut *transaction)
      .await?;
    transaction.commit().await?;
    Ok(Channels { webdav: None })
  }
}
