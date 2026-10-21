use super::types::{REMOVED_WORKSPACES, RecentWorkspaceStatus};
use super::{RecentWorkspace, SettingsStore, json_error};
use crate::{database::workspace_key, error::BackendResult};
use serde_json::Value;
use sqlx::{Sqlite, Transaction};
use std::collections::HashSet;

fn path_key(path: &str) -> BackendResult<String> {
  workspace_key("external", path)
}

impl SettingsStore {
  pub async fn recent_paths(&self) -> BackendResult<Vec<String>> {
    Ok(
      sqlx::query_scalar("SELECT workspace_path FROM recent_workspaces ORDER BY position LIMIT 8")
        .fetch_all(&self.pool)
        .await?,
    )
  }
  pub async fn list_recent_workspaces(&self) -> BackendResult<Vec<RecentWorkspace>> {
    let mut entries = Vec::new();
    for path in self.recent_paths().await? {
      let status = match tokio::fs::metadata(&path).await {
        Ok(metadata) if metadata.is_dir() => match tokio::fs::read_dir(&path).await {
          Ok(_) => RecentWorkspaceStatus::Available,
          Err(_) => RecentWorkspaceStatus::Unavailable,
        },
        Ok(metadata) if metadata.is_file() => match tokio::fs::File::open(&path).await {
          Ok(_) => RecentWorkspaceStatus::Available,
          Err(_) => RecentWorkspaceStatus::Unavailable,
        },
        Ok(_) => RecentWorkspaceStatus::Unavailable,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
          RecentWorkspaceStatus::Missing
        }
        Err(_) => RecentWorkspaceStatus::Unavailable,
      };
      entries.push(RecentWorkspace { path, status });
    }
    Ok(entries)
  }
  pub async fn remove_recent_workspace(&self, path: &str) -> BackendResult<()> {
    let key = path_key(path)?;
    let _guard = self.mutation.lock().await;
    let mut transaction = self.pool.begin().await?;
    let paths: Vec<String> =
      sqlx::query_scalar("SELECT workspace_path FROM recent_workspaces ORDER BY position")
        .fetch_all(&mut *transaction)
        .await?;
    if !paths
      .iter()
      .any(|path| path_key(path).ok().as_ref() == Some(&key))
    {
      return Ok(());
    }
    let mut removed = removed_paths(&mut transaction).await?;
    removed.insert(key.clone());
    write_removed(&mut transaction, removed).await?;
    replace_paths(
      &mut transaction,
      paths
        .into_iter()
        .filter(|path| path_key(path).ok().as_ref() != Some(&key))
        .collect(),
    )
    .await?;
    transaction.commit().await?;
    Ok(())
  }
}
async fn removed_paths(
  transaction: &mut Transaction<'_, Sqlite>,
) -> BackendResult<HashSet<String>> {
  let value: Option<String> = sqlx::query_scalar("SELECT value_json FROM settings WHERE key=?")
    .bind(REMOVED_WORKSPACES)
    .fetch_optional(&mut **transaction)
    .await?;
  let state: Value = match value {
    Some(value) => serde_json::from_str(&value).map_err(json_error)?,
    None => Value::Null,
  };
  Ok(
    state
      .get("paths")
      .and_then(Value::as_array)
      .map(|paths| {
        paths
          .iter()
          .filter_map(Value::as_str)
          .map(String::from)
          .collect()
      })
      .unwrap_or_default(),
  )
}
async fn write_removed(
  transaction: &mut Transaction<'_, Sqlite>,
  paths: HashSet<String>,
) -> BackendResult<()> {
  sqlx::query("INSERT INTO settings(key,value_json,version) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json")
        .bind(REMOVED_WORKSPACES).bind(serde_json::json!({"paths":paths}).to_string()).execute(&mut **transaction).await?;
  Ok(())
}
pub(super) async fn record_recent(
  transaction: &mut Transaction<'_, Sqlite>,
  path: &str,
  explicitly_opened: bool,
) -> BackendResult<()> {
  let key = path_key(path)?;
  let mut removed = removed_paths(transaction).await?;
  if explicitly_opened && removed.remove(&key) {
    write_removed(transaction, removed.clone()).await?;
  }
  let previous: Vec<String> =
    sqlx::query_scalar("SELECT workspace_path FROM recent_workspaces ORDER BY position")
      .fetch_all(&mut **transaction)
      .await?;
  let mut seen = removed;
  let paths = std::iter::once(path.to_string())
    .chain(previous)
    .filter(|path| path_key(path).is_ok_and(|key| seen.insert(key)))
    .take(8)
    .collect();
  replace_paths(transaction, paths).await
}
async fn replace_paths(
  transaction: &mut Transaction<'_, Sqlite>,
  paths: Vec<String>,
) -> BackendResult<()> {
  sqlx::query("DELETE FROM recent_workspaces")
    .execute(&mut **transaction)
    .await?;
  for (position, path) in paths.into_iter().enumerate() {
    sqlx::query("INSERT INTO recent_workspaces(workspace_path,position) VALUES(?,?)")
      .bind(path)
      .bind(position as i64)
      .execute(&mut **transaction)
      .await?;
  }
  Ok(())
}
