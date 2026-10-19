use super::{
  core::{CoreConfig, CoreModule},
  *,
};
use crate::{database::Database, settings::SettingsStore};
use fluxdi::static_module;
use tauri::Manager;

static_module! {
    struct ImportedCore {
        import core: crate::composition::core::CoreModule {
            async database: Database;
            async settings: SettingsStore;
        };
    }
}

#[tokio::test]
async fn imported_roots_share_one_database_and_connection_pool() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let core = CoreModule::new(Shared::new(CoreConfig {
    data_dir: directory.path().to_owned(),
    exclude_engine_cache: false,
  }));
  let imported = ImportedCore::new(core.clone()).in_context(core.injector());
  let child = imported.create_child();
  let database = core.database().await.map_err(graph_error)?;
  let imported_database = imported.database().await.map_err(graph_error)?;
  let child_database = child.database().await.map_err(graph_error)?;
  assert!(Shared::ptr_eq(&database, &imported_database));
  assert!(Shared::ptr_eq(&database, &child_database));
  let settings = imported.settings().await.map_err(graph_error)?;
  let child_settings = child.settings().await.map_err(graph_error)?;
  assert!(Shared::ptr_eq(&settings, &child_settings));

  // A TEMP table belongs to one SQLite connection. Seeing it through settings
  // proves this graph did not open a second pool against the same database file.
  sqlx::query("CREATE TEMP TABLE composition_pool_identity(value INTEGER)")
    .execute(&database.pool)
    .await?;
  sqlx::query("INSERT INTO composition_pool_identity VALUES(41)")
    .execute(&database.pool)
    .await?;
  let value: i64 = sqlx::query_scalar("SELECT value FROM composition_pool_identity")
    .fetch_one(&settings.pool)
    .await?;
  assert_eq!(value, 41);

  drop(child_settings);
  drop(child_database);
  drop(imported_database);
  drop(child);
  drop(imported);
  drop(core);
  // Ownership transfer keeps ordinary State<T> compatibility and the existing
  // service instance: it does not construct fresh mutexes, caches, or pools.
  let app = tauri::test::mock_app();
  assert!(app.manage(take(database)?));
  assert!(app.manage(take(settings)?));
  let database = app.state::<Database>();
  let settings = app.state::<SettingsStore>();
  assert!(!settings.pool.is_closed());
  database.pool.close().await;
  assert!(settings.pool.is_closed());
  Ok(())
}

#[tokio::test]
async fn failed_database_factory_preserves_error_and_can_retry() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let blocked = directory.path().join("blocked");
  tokio::fs::write(&blocked, b"not a directory").await?;
  let graph = CoreModule::new(Shared::new(CoreConfig {
    data_dir: blocked.clone(),
    exclude_engine_cache: false,
  }));
  let failure = graph.settings().await.err().map(graph_error);
  assert_eq!(
    failure.as_ref().map(|error| error.code.as_str()),
    Some("IO_ERROR")
  );
  tokio::fs::remove_file(blocked).await?;
  let settings = graph.settings().await.map_err(graph_error)?;
  let database = graph.database().await.map_err(graph_error)?;
  assert!(!settings.pool.is_closed());
  database.pool.close().await;
  Ok(())
}

#[tokio::test]
async fn headless_graph_initializes_storage_without_gui_workspace() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let services = HeadlessServices::open(directory.path().to_owned()).await?;
  assert!(!directory.path().join("workspace").exists());
  assert!(!services.database.pool.is_closed());
  services.analysis.stop().await?;
  services.database.pool.close().await;
  Ok(())
}

#[test]
fn ownership_transfer_rejects_a_retained_graph_reference() -> BackendResult<()> {
  let value = Shared::new(String::from("same service"));
  let retained = value.clone();
  let error = take(value).err();
  assert_eq!(
    error.as_ref().map(|error| error.code.as_str()),
    Some("SERVICE_GRAPH_OWNERSHIP")
  );
  assert_eq!(take(retained)?, "same service");
  Ok(())
}
