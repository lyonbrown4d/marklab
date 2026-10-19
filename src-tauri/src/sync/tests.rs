use super::*;
use crate::{database::Database, error::BackendResult, workspace::RootInfo};
use serde_json::json;
#[tokio::test]
async fn session_passwords_stay_in_memory_and_bound_profiles_cannot_be_deleted() -> BackendResult<()>
{
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = SyncService::new(database.pool.clone()).await?;
  let input: ProfileInput = serde_json::from_value(
    json!({"id":"local","label":"Local","endpoint":"http://127.0.0.1:8080/dav","username":"user","allowInsecureLocal":true,"sessionOnly":true,"password":"session-password-do-not-store"}),
  )?;
  let profile = service.update_profile(input).await?;
  assert!(profile.has_password);
  assert_eq!(profile.base_path, "/dav");
  let stored: String =
    sqlx::query_scalar("SELECT value_json FROM webdav_profiles WHERE id='local'")
      .fetch_one(&database.pool)
      .await?;
  assert!(!stored.contains("session-password-do-not-store"));
  let root = RootInfo {
    kind: "external".into(),
    path: directory
      .path()
      .join("notes")
      .to_string_lossy()
      .into_owned(),
  };
  service
    .set_channel(
      &root,
      Channel {
        provider: "webdav".into(),
        profile_id: "local".into(),
        remote_root: "/notes".into(),
        auto_sync: false,
      },
    )
    .await?;
  assert!(service.delete_profile("local").await.is_err());
  let restarted = SyncService::new(database.pool.clone()).await?;
  assert!(!restarted.list_profiles().await?[0].has_password);
  service.remove_channel(&root).await?;
  service.delete_profile("local").await?;
  assert!(service.list_profiles().await?.is_empty());
  database.pool.close().await;
  Ok(())
}
#[tokio::test]
async fn switching_remote_bindings_resets_the_previous_remote_baseline() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = SyncService::new(database.pool.clone()).await?;
  service.update_profile(serde_json::from_value(json!({"id":"remote","label":"Remote","endpoint":"https://example.com","username":"user","sessionOnly":true}))?).await?;
  let root = RootInfo {
    kind: "external".into(),
    path: directory
      .path()
      .join("notes")
      .to_string_lossy()
      .into_owned(),
  };
  let channel = Channel {
    provider: "webdav".into(),
    profile_id: "remote".into(),
    remote_root: "/one".into(),
    auto_sync: false,
  };
  service.set_channel(&root, channel.clone()).await?;
  service
    .save_state(
      &root,
      &SyncState {
        version: 1,
        remote_manifest_etag: Some("\"old\"".into()),
        baseline: vec![],
        unresolved_conflicts: vec![],
        updated_at: "2026-10-17T00:00:00.000Z".into(),
      },
    )
    .await?;
  let mut next = channel;
  next.remote_root = "/two".into();
  service.set_channel(&root, next).await?;
  assert!(service.load_state(&root).await?.is_none());
  database.pool.close().await;
  Ok(())
}
#[test]
fn remote_and_local_paths_reject_traversal_and_nonportable_names() {
  for path in [
    "../x",
    "%2e%2e/x",
    "%252e%252e/x",
    "a/%2f/b",
    "a\\b",
    "a/\0b",
  ] {
    assert!(paths::remote_path(path).is_err(), "{path}");
  }
  for path in [
    "../x",
    "/x",
    "a//b",
    "a/.git/config",
    "A/Node_Modules/index.js",
    "CON.txt",
    "folder/trailing.",
    "a:b",
  ] {
    assert!(paths::sync_path(path).is_err(), "{path}");
  }
  assert_eq!(
    paths::sync_path("folder/cafe\u{301}.md").unwrap(),
    "folder/café.md"
  );
  assert!(paths::validate_endpoint("http://192.168.1.4/dav", false, None).is_err());
  assert!(paths::validate_endpoint("http://192.168.1.4/dav", true, None).is_ok());
  assert!(paths::validate_endpoint("https://example.com/a/../outside", false, None).is_err());
  assert!(paths::validate_endpoint("https://user:pass@example.com", false, None).is_err());
  assert!(paths::decode("%eé").is_err());
}
