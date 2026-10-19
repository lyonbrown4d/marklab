use super::*;

#[tokio::test]
async fn opens_a_separate_durable_database_with_fts5() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  sqlx::query("INSERT INTO settings(key,value_json,version) VALUES('test','{}',1)")
    .execute(&database.pool)
    .await?;
  // Search relies on SQLite's bundled FTS5 capability across desktop packages.
  sqlx::query("CREATE VIRTUAL TABLE temp.search_test USING fts5(content)")
    .execute(&database.pool)
    .await?;
  sqlx::query("INSERT INTO search_test(content) VALUES('persisted notes')")
    .execute(&database.pool)
    .await?;
  let count: i64 =
    sqlx::query_scalar("SELECT count(*) FROM search_test WHERE search_test MATCH 'notes'")
      .fetch_one(&database.pool)
      .await?;
  assert_eq!(count, 1);
  database.pool.close().await;
  let reopened = Database::open(directory.path()).await?;
  let json: String = sqlx::query_scalar("SELECT value_json FROM settings WHERE key='test'")
    .fetch_one(&reopened.pool)
    .await?;
  assert_eq!(json, "{}");
  assert!(
    directory
      .path()
      .join("tauri-storage/marklab.sqlite")
      .is_file()
  );
  reopened.pool.close().await;
  Ok(())
}

#[cfg(unix)]
#[test]
fn canonical_workspace_names_remain_distinct_on_case_sensitive_volumes() {
  assert_ne!(
    workspace_key("external", "/data/Notes").expect("key"),
    workspace_key("external", "/data/notes").expect("key")
  );
  assert_ne!(
    workspace_key("external", "/data/café").expect("key"),
    workspace_key("external", "/data/cafe\u{301}").expect("key")
  );
  assert_ne!(
    workspace_key("single", "/data/a\\b.md").expect("key"),
    workspace_key("single", "/data/a/b.md").expect("key")
  );
}
