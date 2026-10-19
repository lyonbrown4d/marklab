use super::*;
use crate::database::Database;
use serde_json::json;
fn fixture_path(path: &str) -> String {
  if path.starts_with('/') {
    std::env::temp_dir()
      .join("marklab-fixtures")
      .join(path.trim_start_matches('/'))
      .to_string_lossy()
      .into_owned()
  } else {
    path.to_string()
  }
}
fn session(path: &str, file: &str) -> Value {
  let path = fixture_path(path);
  json!({"state":{"rootPath":path,"rootKind":"external","activeTabId":format!("file:edit:{file}"),"tabs":[{"kind":"file","view":"edit","path":file}]},"version":1})
}

#[tokio::test]
async fn windows_remain_isolated_and_old_saves_do_not_select_the_workspace() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let store = SettingsStore::new(database.pool.clone());
  store
    .set(WORKSPACE, "main", session("/first", "First.md"))
    .await?;
  store
    .set(WORKSPACE, "second", session("/second", "Second.md"))
    .await?;
  store
    .set(WORKSPACE, "main", session("/first", "Changed.md"))
    .await?;
  assert_eq!(
    store.get(WORKSPACE, "main").await?.unwrap().state["activeTabId"],
    "file:edit:Changed.md"
  );
  store
    .save_window_sessions(&["main".into(), "second".into()])
    .await?;
  store.remove_session("second").await?;
  let restarted = SettingsStore::new(database.pool.clone());
  let others = restarted.restore_sessions().await?;
  assert_eq!(others.len(), 1);
  assert_eq!(others[0].state["rootPath"], fixture_path("/first"));
  assert_eq!(
    restarted.get(WORKSPACE, "main").await?.unwrap().state["rootPath"],
    fixture_path("/second")
  );
  assert!(restarted.restore_sessions().await?.is_empty());
  database.pool.close().await;
  Ok(())
}
#[tokio::test]
async fn preferences_are_allowlisted_and_removed_recents_do_not_return_on_old_saves()
-> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let store = SettingsStore::new(database.pool.clone());
  store
    .set(
      "marklab.preferences",
      "main",
      json!({"state":{"locale":"zh-CN","rootPath":"/secret"},"version":2}),
    )
    .await?;
  let value = store.get("marklab.preferences", "other").await?.unwrap();
  assert_eq!(value.state["locale"], "zh-CN");
  assert!(!value.state.contains_key("rootPath"));
  assert!(
    store
      .set("untrusted.key", "main", json!({"state":{}}))
      .await
      .is_err()
  );
  store
    .set(WORKSPACE, "main", session("/first", "a.md"))
    .await?;
  store
    .remove_recent_workspace(&fixture_path("/first"))
    .await?;
  store
    .set(WORKSPACE, "main", session("/first", "b.md"))
    .await?;
  assert!(store.recent_paths().await?.is_empty());
  let copy = serde_json::from_value(session("/first", "c.md")).map_err(json_error)?;
  store.write_session("new", copy, Some(true), false).await?;
  assert_eq!(store.recent_paths().await?, vec![fixture_path("/first")]);
  database.pool.close().await;
  Ok(())
}
#[tokio::test]
async fn explicitly_restored_old_windows_do_not_change_last_selected_workspace() -> BackendResult<()>
{
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let store = SettingsStore::new(database.pool.clone());
  store
    .set(WORKSPACE, "main", session("/last", "last.md"))
    .await?;
  store
    .write_session(
      "restored",
      serde_json::from_value(session("/older", "old.md")).map_err(json_error)?,
      Some(false),
      false,
    )
    .await?;
  store
    .set(WORKSPACE, "restored", session("/older", "updated.md"))
    .await?;
  store
    .set(
      WORKSPACE,
      "empty",
      json!({"state":{"rootPath":"","tabs":[]}}),
    )
    .await?;
  let restarted = SettingsStore::new(database.pool.clone());
  restarted.restore_sessions().await?;
  assert_eq!(
    restarted.read_session("main").await?.unwrap().state["rootPath"],
    fixture_path("/last")
  );
  assert!(
    store
      .set(WORKSPACE, "main", session("../escape", "x.md"))
      .await
      .is_err()
  );
  assert_eq!(
    store.read_session("main").await?.unwrap().state["rootPath"],
    fixture_path("/last")
  );
  database.pool.close().await;
  Ok(())
}
