use super::super::ManifestEntry;
use super::*;
use crate::{
  database::Database,
  workspace::{RootInfo, Workspace},
};
#[path = "engine_test_server.rs"]
mod server;
fn entry(path: &str, hash: char) -> ManifestEntry {
  ManifestEntry {
    path: path.into(),
    hash: hash.to_string().repeat(64),
    size: 1,
    modified_at: "2026-10-17T00:00:00.000Z".into(),
    device_id: "fixture".into(),
    storage: None,
    etag: None,
    deleted_at: None,
  }
}
#[test]
fn three_way_planner_preserves_deletions_and_conflicts() {
  let base = entry("file.md", 'a');
  let changed = entry("file.md", 'b');
  let other = entry("file.md", 'c');
  let plan = |local: &[ManifestEntry], baseline: &[ManifestEntry], remote: &[ManifestEntry]| {
    manifest::plan(local, baseline, remote, &BTreeSet::new())[0].kind
  };
  assert_eq!(
    plan(
      std::slice::from_ref(&changed),
      std::slice::from_ref(&base),
      std::slice::from_ref(&base)
    ),
    manifest::Kind::Upload
  );
  assert_eq!(
    plan(
      std::slice::from_ref(&base),
      std::slice::from_ref(&base),
      std::slice::from_ref(&changed)
    ),
    manifest::Kind::Download
  );
  assert_eq!(
    plan(
      &[],
      std::slice::from_ref(&base),
      std::slice::from_ref(&base)
    ),
    manifest::Kind::DeleteRemote
  );
  assert_eq!(
    plan(
      std::slice::from_ref(&base),
      std::slice::from_ref(&base),
      &[]
    ),
    manifest::Kind::DeleteLocal
  );
  assert_eq!(
    plan(&[changed], std::slice::from_ref(&base), &[other]),
    manifest::Kind::Conflict
  );
  let mut tombstone = base;
  tombstone.deleted_at = Some(tombstone.modified_at.clone());
  assert_eq!(
    plan(&[], &[tombstone.clone()], &[tombstone]),
    manifest::Kind::Noop
  );
}
#[test]
fn manifest_rejects_colliding_paths_and_invalid_object_hash() {
  let mut manifest = Manifest {
    version: 1,
    device_id: "fixture".into(),
    updated_at: "2026-10-17T00:00:00.000Z".into(),
    entries: vec![entry("Notes.md", 'a'), entry("notes.md", 'a')],
  };
  assert!(manifest::validate(&manifest).is_err());
  manifest.entries.pop();
  manifest.entries[0].hash = "../escape".into();
  assert!(manifest::validate(&manifest).is_err());
  assert!(manifest::strong(Some("W/\"weak\"")).is_err());
}
async fn fixture(endpoint: &str) -> (tempfile::TempDir, SyncService, std::sync::Arc<Workspace>) {
  let directory = tempfile::tempdir().unwrap();
  let database = Database::open(directory.path()).await.unwrap();
  let service = SyncService::new(database.pool.clone()).await.unwrap();
  service.update_profile(serde_json::from_value(serde_json::json!({"id":"test","label":"Test","endpoint":endpoint,"username":"fixture","allowInsecureLocal":true,"sessionOnly":true})).unwrap()).await.unwrap();
  let root = directory.path().join("workspace");
  tokio::fs::create_dir(&root).await.unwrap();
  let workspace = std::sync::Arc::new(Workspace::new(
    RootInfo {
      kind: crate::workspace::RootKind::External,
      path: root.to_string_lossy().into(),
    },
    1,
  ));
  service
    .set_channel(
      &workspace.root_info(),
      super::super::Channel {
        provider: crate::sync::SyncProvider::Webdav,
        profile_id: "test".into(),
        remote_root: "/notes".into(),
        auto_sync: false,
      },
    )
    .await
    .unwrap();
  (directory, service, workspace)
}
#[tokio::test]
async fn independent_workspaces_upload_download_delete_and_preserve_conflicts() {
  let server = server::Server::new().await;
  let (_a, first_service, first) = fixture(&server.endpoint).await;
  let (_b, second_service, second) = fixture(&server.endpoint).await;
  let cancel = CancellationToken::new();
  tokio::fs::write(first.root_directory().join("note.md"), "first\n")
    .await
    .unwrap();
  let uploaded = synchronize(&first_service, &first, &|_| {}, cancel.clone(), None)
    .await
    .unwrap();
  assert_eq!(uploaded.uploaded, 1);
  let downloaded = synchronize(&second_service, &second, &|_| {}, cancel.clone(), None)
    .await
    .unwrap();
  assert_eq!(downloaded.downloaded, 1);
  assert_eq!(
    tokio::fs::read_to_string(second.root_directory().join("note.md"))
      .await
      .unwrap(),
    "first\n"
  );
  tokio::fs::write(first.root_directory().join("note.md"), "first device\n")
    .await
    .unwrap();
  tokio::fs::write(second.root_directory().join("note.md"), "second device\n")
    .await
    .unwrap();
  synchronize(&first_service, &first, &|_| {}, cancel.clone(), None)
    .await
    .unwrap();
  let conflict = synchronize(&second_service, &second, &|_| {}, cancel.clone(), None)
    .await
    .unwrap();
  assert_eq!(conflict.conflicts.len(), 1);
  assert_eq!(
    tokio::fs::read_to_string(second.root_directory().join("note.md"))
      .await
      .unwrap(),
    "second device\n"
  );
  let conflict_file = conflict.conflicts[0].conflict_path.as_ref().unwrap();
  assert_eq!(
    tokio::fs::read_to_string(second.root_directory().join(conflict_file))
      .await
      .unwrap(),
    "first device\n"
  );
  let binding = super::super::Binding {
    profile_id: "test".into(),
    remote_root: "/notes".into(),
  };
  let comparison = super::super::conflicts::read(
    &second_service,
    &second,
    super::super::ConflictRequest {
      root_path: second.root_info().path,
      path: "note.md".into(),
      binding: binding.clone(),
    },
    cancel.clone(),
    None,
  )
  .await
  .unwrap();
  let resolved = super::super::conflicts::resolve(
    &second_service,
    &second,
    super::super::ResolutionRequest {
      root_path: second.root_info().path,
      path: "note.md".into(),
      binding,
      choice: crate::sync::ConflictChoice::Remote,
      expected_local_hash: comparison.local.hash,
      expected_remote_hash: comparison.saved_remote.hash,
      confirm_delete: false,
    },
    cancel.clone(),
    None,
  )
  .await
  .unwrap();
  assert!(resolved.ok);
  assert!(resolved.backup_path.is_some());
  assert_eq!(
    tokio::fs::read_to_string(second.root_directory().join("note.md"))
      .await
      .unwrap(),
    "first device\n"
  );
  tokio::fs::remove_file(first.root_directory().join("note.md"))
    .await
    .unwrap();
  synchronize(&first_service, &first, &|_| {}, cancel.clone(), None)
    .await
    .unwrap();
  synchronize(&second_service, &second, &|_| {}, cancel.clone(), None)
    .await
    .unwrap();
  assert!(!second.root_directory().join("note.md").exists());
}
#[tokio::test]
async fn corrupt_remote_objects_never_replace_local_content() {
  let server = server::Server::new().await;
  let (_a, service, workspace) = fixture(&server.endpoint).await;
  let cancel = CancellationToken::new();
  let mut value = entry("note.md", 'a');
  value.storage = Some("object".into());
  let manifest = Manifest {
    version: 1,
    device_id: "other".into(),
    updated_at: value.modified_at.clone(),
    entries: vec![value.clone()],
  };
  server
    .put(
      "/notes/.marklab-sync/manifest.json",
      serde_json::to_vec(&manifest).unwrap(),
    )
    .await;
  server
    .put(
      &format!("/notes/.marklab-sync/objects/{}", value.hash),
      b"corrupt".to_vec(),
    )
    .await;
  assert!(
    synchronize(&service, &workspace, &|_| {}, cancel, None)
      .await
      .is_err()
  );
  assert!(!workspace.root_directory().join("note.md").exists());
  assert!(
    service
      .load_state(&workspace.root_info())
      .await
      .unwrap()
      .is_none()
  );
}
#[tokio::test]
async fn cancellation_has_no_remote_or_local_publish() {
  let server = server::Server::new().await;
  let (_a, service, workspace) = fixture(&server.endpoint).await;
  tokio::fs::write(workspace.root_directory().join("note.md"), "draft")
    .await
    .unwrap();
  let cancel = CancellationToken::new();
  cancel.cancel();
  assert_eq!(
    synchronize(&service, &workspace, &|_| {}, cancel, None)
      .await
      .err()
      .unwrap()
      .code,
    "SYNC_CANCELLED"
  );
  assert!(
    server
      .get("/notes/.marklab-sync/manifest.json")
      .await
      .is_none()
  );
  assert_eq!(
    tokio::fs::read_to_string(workspace.root_directory().join("note.md"))
      .await
      .unwrap(),
    "draft"
  );
}
