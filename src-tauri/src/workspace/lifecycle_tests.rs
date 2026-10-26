use super::{WorkspaceRegistry, tests::fixture};
use std::{path::PathBuf, time::Duration};

#[tokio::test]
async fn root_replacement_flushes_old_edits_and_stops_old_session_mutations() {
  let (directory, registry, old) = fixture().await;
  old.write_file("a.md", "must survive").await.unwrap();
  let next = directory.path().join("next");
  tokio::fs::create_dir(&next).await.unwrap();
  let workspace = registry
    .open_async("main", Some(next.to_str().unwrap()), false)
    .await
    .unwrap();
  assert_eq!(
    tokio::fs::read_to_string(directory.path().join("notes/a.md"))
      .await
      .unwrap(),
    "must survive"
  );
  assert_ne!(workspace.generation, old.generation);
  assert_eq!(
    old.write_file("a.md", "lost").await.unwrap_err().code,
    "STALE_SESSION"
  );
  assert_eq!(
    old.open_file("a.md").await.unwrap_err().code,
    "STALE_SESSION"
  );
  assert!(
    registry
      .open_async("main", Some("/missing/marklab-workspace"), false)
      .await
      .is_err()
  );
  assert_eq!(
    registry.get("main").unwrap().generation,
    workspace.generation
  );
  workspace.ensure_active().unwrap();
}
#[tokio::test]
async fn close_waits_for_final_mutation_and_flush_before_removal() {
  let (_directory, registry, workspace) = fixture().await;
  let path = workspace.resolve_async("a.md").await.unwrap();
  let guard = workspace.mutation.lock().await;
  let closing = {
    let registry = registry.clone();
    tokio::spawn(async move { registry.close_async("main").await })
  };
  workspace
    .write_file_under_lock("a.md", "latest accepted edit")
    .await
    .unwrap();
  assert!(!closing.is_finished());
  drop(guard);
  closing.await.unwrap().unwrap();
  assert_eq!(
    tokio::fs::read_to_string(path).await.unwrap(),
    "latest accepted edit"
  );
  assert!(registry.get("main").is_err());
  assert!(workspace.ensure_active().is_err());
}
#[tokio::test]
async fn single_file_rename_keeps_root_and_buffer_identity_and_never_overwrites() {
  let (directory, registry, _) = fixture().await;
  let path = directory.path().join("notes/a.md");
  let workspace = registry
    .open_async("single", Some(path.to_str().unwrap()), true)
    .await
    .unwrap();
  workspace
    .write_file("a.md", "renamed contents")
    .await
    .unwrap();
  workspace.move_path("a.md", "renamed.md").await.unwrap();
  assert!(workspace.root_info().path.ends_with("renamed.md"));
  assert_eq!(
    workspace.open_file("renamed.md").await.unwrap(),
    "renamed contents"
  );
  assert!(workspace.open_file("a.md").await.is_err());
  tokio::fs::write(directory.path().join("notes/taken.md"), "keep")
    .await
    .unwrap();
  assert!(workspace.move_path("renamed.md", "taken.md").await.is_err());
  assert_eq!(
    tokio::fs::read_to_string(directory.path().join("notes/taken.md"))
      .await
      .unwrap(),
    "keep"
  );
  assert_eq!(
    workspace.snapshot().await.unwrap().entries[0].path,
    "renamed.md"
  );
}
#[tokio::test]
async fn native_watcher_observes_external_changes_and_stops_when_dropped() {
  let (_directory, _registry, workspace) = fixture().await;
  let root = workspace.root_directory();
  let (watcher, mut receiver, _overflow) = super::watcher::watch_directory(root.clone(), true)
    .await
    .unwrap();
  tokio::fs::write(root.join("created.md"), "external")
    .await
    .unwrap();
  let observed = tokio::time::timeout(Duration::from_secs(8), async {
    loop {
      if let Some(Ok(event)) = receiver.recv().await
        && event.paths.iter().any(|path| path.ends_with("created.md"))
      {
        break;
      }
    }
  })
  .await;
  assert!(
    observed.is_ok(),
    "native watcher must deliver filesystem events"
  );
  crate::blocking::run(move || {
    drop(watcher);
    Ok(())
  })
  .await
  .unwrap();
  // A callback already in flight can enqueue its last event during drop.
  // Drain that backlog, but still require every sender to close promptly.
  tokio::time::timeout(Duration::from_secs(2), async {
    while receiver.recv().await.is_some() {}
  })
  .await
  .expect("native watcher must close its event channel after being dropped");
}
#[tokio::test]
async fn guide_install_preserves_edits_and_does_not_recreate_deleted_user_guides() {
  let profile = tempfile::tempdir().unwrap();
  let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/workspace-guide");
  super::guide::initialize(profile.path().into(), source.clone(), "en-US".into())
    .await
    .unwrap();
  let home = profile.path().join("workspace/Home.md");
  assert!(home.is_file());
  tokio::fs::write(&home, "my home").await.unwrap();
  tokio::fs::remove_dir_all(profile.path().join("workspace/User Guide"))
    .await
    .unwrap();
  super::guide::initialize(profile.path().into(), source, "zh-CN".into())
    .await
    .unwrap();
  assert_eq!(tokio::fs::read_to_string(home).await.unwrap(), "my home");
  assert!(!profile.path().join("workspace/User Guide").exists());
}
#[tokio::test]
async fn workspace_paths_reject_aliases_escape_and_internal_symlink_targets() {
  let (directory, _registry, workspace) = fixture().await;
  for invalid in [
    "../secret",
    "./a.md",
    "a//b",
    "a:stream",
    "/etc/passwd",
    "a\\b",
  ] {
    assert!(workspace.resolve_async(invalid).await.is_err(), "{invalid}");
  }
  #[cfg(unix)]
  {
    std::os::unix::fs::symlink(directory.path(), workspace.root_directory().join("escape"))
      .unwrap();
    assert!(workspace.resolve_async("escape/secret").await.is_err());
  }
  let registry = WorkspaceRegistry::new(&directory.path().join("other-profile")).unwrap();
  let internal = registry.open_async("internal", None, false).await.unwrap();
  assert_eq!(
    internal.root_info().kind,
    crate::workspace::RootKind::Internal
  );
}

#[tokio::test]
async fn shutdown_gate_keeps_workspace_snapshot_stable_and_can_retry_after_failure() {
  let (_directory, registry, workspace) = fixture().await;
  registry.begin_shutdown().unwrap();
  assert_eq!(
    registry
      .open_async("new", None, false)
      .await
      .err()
      .unwrap()
      .code,
    "APP_CLOSING"
  );
  assert_eq!(
    registry
      .open_async("main", None, false)
      .await
      .err()
      .unwrap()
      .code,
    "APP_CLOSING"
  );
  assert_eq!(
    registry.get("main").unwrap().generation,
    workspace.generation
  );
  registry.cancel_shutdown();
  let next = registry.open_async("main", None, false).await.unwrap();
  assert_ne!(next.generation, workspace.generation);
}
