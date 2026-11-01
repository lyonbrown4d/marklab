use super::{WorkspaceRegistry, layout_types::*, layout_validation};
use crate::{database::Database, error::BackendResult, settings::SettingsStore};
use serde_json::json;

fn fixture() -> WorkspaceLayout {
  serde_json::from_value(json!({
    "grid": {"root": {"type":"branch", "data":[
      {"type":"leaf","data":{"id":"group-a","views":["a"],"activeView":"a"},"size":300},
      {"type":"leaf","data":{"id":"group-b","views":["b"],"activeView":"b"},"size":200}
    ]}, "width":500,"height":400,"orientation":"HORIZONTAL"},
    "panels":{
      "a":{"id":"a","contentComponent":"workspace","title":"A","params":{"tab":{"id":"a","route":"/files/edit/a.md","title":"A","kind":"document"}},"renderer":"onlyWhenVisible"},
      "b":{"id":"b","contentComponent":"workspace","title":"Graph","params":{"tab":{"id":"b","route":"/workspace/graph","title":"Graph","kind":"graph"}},"renderer":"onlyWhenVisible"}
    },"activeGroup":"group-a"
  })).unwrap()
}

fn key(registry: &WorkspaceRegistry, label: &str) -> String {
  let root = registry.get(label).unwrap().root_info();
  format!("{}:{}", root.kind.as_str(), root.path)
}

fn request(
  registry: &WorkspaceRegistry,
  label: &str,
  layout: WorkspaceLayout,
) -> SetWorkspaceLayoutRequest {
  SetWorkspaceLayoutRequest {
    workspace_key: key(registry, label),
    session_generation: registry.binding_generation(label).unwrap(),
    layout,
  }
}

#[path = "layout_validation_tests.rs"]
mod validation;

#[tokio::test]
async fn layouts_are_per_workspace_and_restore_prunes_only_missing_files() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let first = directory.path().join("first");
  let second = directory.path().join("second");
  std::fs::create_dir_all(&first)?;
  std::fs::create_dir_all(&second)?;
  std::fs::write(first.join("a.md"), "content")?;
  let database = Database::open(directory.path()).await?;
  let store = SettingsStore::new(database.pool.clone());
  let registry = WorkspaceRegistry::new(directory.path())?;
  registry.open("main", Some(first.to_str().unwrap()), false)?;
  registry.open("shared", Some(first.to_str().unwrap()), false)?;
  registry.open("second", Some(second.to_str().unwrap()), false)?;
  let layout = fixture();
  store
    .set_workspace_layout(
      &registry,
      "main",
      request(&registry, "main", layout.clone()),
    )
    .await?;
  let restored = store
    .get_workspace_layout(&registry, "shared", &key(&registry, "shared"))
    .await?;
  assert_eq!(restored.layout, Some(layout));
  assert!(
    store
      .get_workspace_layout(&registry, "second", &key(&registry, "second"))
      .await?
      .layout
      .is_none()
  );
  std::fs::remove_file(first.join("a.md"))?;
  let restored = store
    .get_workspace_layout(&registry, "main", &key(&registry, "main"))
    .await?
    .layout
    .unwrap();
  assert_eq!(restored.panels.keys().collect::<Vec<_>>(), vec!["b"]);
  assert_eq!(restored.active_group, None);
  layout_validation::validate(&restored)?;
  // A new store (restart) reads the same Rust-owned database state.
  let restarted = SettingsStore::new(database.pool.clone());
  assert_eq!(
    restarted
      .get_workspace_layout(&registry, "main", &key(&registry, "main"))
      .await?
      .layout,
    Some(restored)
  );
  database.pool.close().await;
  Ok(())
}

#[tokio::test]
async fn old_root_and_shared_workspace_aba_writes_are_rejected() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let second = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let store = SettingsStore::new(database.pool.clone());
  let registry = WorkspaceRegistry::new(directory.path())?;
  registry.open("main", None, false)?;
  registry.open("shared", None, false)?;
  let old = request(&registry, "main", fixture());
  let old_again = request(&registry, "main", fixture());
  registry
    .open_async("main", Some(second.path().to_str().unwrap()), false)
    .await?;
  assert_eq!(
    store
      .set_workspace_layout(&registry, "main", old)
      .await
      .unwrap_err()
      .code,
    "WORKSPACE_MISMATCH"
  );
  registry.open_async("main", None, false).await?;
  assert_eq!(
    store
      .set_workspace_layout(&registry, "main", old_again)
      .await
      .unwrap_err()
      .code,
    "STALE_SESSION"
  );
  assert!(
    store
      .get_workspace_layout(&registry, "shared", &key(&registry, "shared"))
      .await?
      .layout
      .is_none()
  );
  database.pool.close().await;
  Ok(())
}

#[tokio::test]
async fn concurrent_windows_commit_complete_layouts_without_mixing_panels() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let store = SettingsStore::new(database.pool.clone());
  let registry = WorkspaceRegistry::new(directory.path())?;
  registry.open("first", None, false)?;
  registry.open("second", None, false)?;
  let first = fixture();
  let mut second = fixture();
  second.grid.width = 999.0;
  let (a, b) = tokio::join!(
    store.set_workspace_layout(
      &registry,
      "first",
      request(&registry, "first", first.clone())
    ),
    store.set_workspace_layout(
      &registry,
      "second",
      request(&registry, "second", second.clone())
    )
  );
  a?;
  b?;
  let raw: Json<WorkspaceLayout> = sqlx::query_scalar("SELECT value_json FROM workspace_layouts")
    .fetch_one(&database.pool)
    .await?;
  assert!(raw.0 == first || raw.0 == second);
  assert_eq!(
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM workspace_layouts")
      .fetch_one(&database.pool)
      .await?,
    1
  );
  database.pool.close().await;
  Ok(())
}

use sqlx::types::Json;

#[tokio::test]
async fn restore_preserves_deleted_file_diff_while_pruning_its_document() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let store = SettingsStore::new(database.pool.clone());
  let registry = WorkspaceRegistry::new(directory.path())?;
  registry.open("main", None, false)?;
  let mut layout = fixture();
  let mut diff = layout.panels["a"].clone();
  diff.id = "diff".into();
  diff.params.tab.id = "diff".into();
  diff.params.tab.route = "/_diff/staged/a.md".into();
  diff.params.tab.kind = WorkspaceLayoutTabKind::Other;
  layout.panels.insert("diff".into(), diff);
  if let WorkspaceLayoutNode::Branch { data, .. } = &mut layout.grid.root
    && let WorkspaceLayoutNode::Leaf { data, .. } = &mut data[1]
  {
    data.views.push("diff".into());
    data.active_view = "diff".into();
  }
  store
    .set_workspace_layout(&registry, "main", request(&registry, "main", layout))
    .await?;
  let restored = store
    .get_workspace_layout(&registry, "main", &key(&registry, "main"))
    .await?
    .layout
    .unwrap();
  assert!(!restored.panels.contains_key("a"));
  assert!(restored.panels.contains_key("diff"));
  assert_eq!(
    restored.panels["diff"].params.tab.route,
    "/_diff/staged/a.md"
  );
  layout_validation::validate(&restored)?;
  database.pool.close().await;
  Ok(())
}
