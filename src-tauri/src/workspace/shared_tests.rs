use super::tests::fixture;
use std::sync::Arc;

#[tokio::test]
async fn windows_share_buffers_and_closing_one_keeps_other_session_active() {
  let (directory, registry, first) = fixture().await;
  let root = directory.path().join("notes");
  let second = registry
    .open_async("second", Some(root.join(".").to_str().unwrap()), false)
    .await
    .unwrap();
  assert!(Arc::ptr_eq(&first, &second));
  assert_eq!(registry.owners(first.generation).unwrap().len(), 2);
  first.write_file("a.md", "shared edit").await.unwrap();
  assert_eq!(second.open_file("a.md").await.unwrap(), "shared edit");
  registry.close_async("main").await.unwrap();
  second.ensure_active().unwrap();
  assert_eq!(
    tokio::fs::read_to_string(root.join("a.md")).await.unwrap(),
    "shared edit"
  );
  second
    .write_file("a.md", "second window edit")
    .await
    .unwrap();
  let next = registry.open_async("second", None, false).await.unwrap();
  assert_ne!(next.generation, second.generation);
  assert!(second.ensure_active().is_err());
  assert_eq!(
    tokio::fs::read_to_string(root.join("a.md")).await.unwrap(),
    "second window edit"
  );
}

#[tokio::test]
async fn root_switch_detaches_only_the_requesting_window() {
  let (_directory, registry, first) = fixture().await;
  let second = registry
    .open_async("second", Some(&first.root_info().path), false)
    .await
    .unwrap();
  first.open_file("a.md").await.unwrap();
  let next = registry.open_async("main", None, false).await.unwrap();
  assert_ne!(first.generation, next.generation);
  assert_eq!(registry.owners(first.generation).unwrap(), vec!["second"]);
  second.write_file("a.md", "still editable").await.unwrap();
  assert_eq!(first.read_file("a.md").await.unwrap(), "still editable");
  registry.close_async("second").await.unwrap();
  assert!(first.ensure_active().is_err());
  next.ensure_active().unwrap();
}

#[tokio::test]
async fn closing_window_rejects_late_root_changes_until_explicitly_reopened() {
  let (_directory, registry, workspace) = fixture().await;
  registry.begin_close("main").unwrap();
  assert_eq!(
    registry
      .open_async("main", None, false)
      .await
      .err()
      .unwrap()
      .code,
    "WINDOW_CLOSING"
  );
  assert_eq!(
    registry.get("main").unwrap().generation,
    workspace.generation
  );
  registry.cancel_close("main");
  workspace.write_file("a.md", "close retry").await.unwrap();
  registry.close_async("main").await.unwrap();
  assert_eq!(
    registry
      .open_async("main", None, false)
      .await
      .err()
      .unwrap()
      .code,
    "WINDOW_CLOSING"
  );
  registry.allow_open("main").unwrap();
  registry
    .open_async("main", None, false)
    .await
    .unwrap()
    .ensure_active()
    .unwrap();
}

#[tokio::test]
async fn explicit_internal_directory_uses_the_same_buffer_and_mutation_gate() {
  let directory = tempfile::tempdir().unwrap();
  let registry = super::WorkspaceRegistry::new(directory.path()).unwrap();
  let internal = registry.open_async("first", None, false).await.unwrap();
  let explicit = registry
    .open_async("second", Some(&internal.root_info().path), false)
    .await
    .unwrap();
  assert!(Arc::ptr_eq(&internal, &explicit));
  assert_eq!(explicit.root_info().kind, "internal");
}

#[tokio::test]
async fn queued_old_window_mutation_is_rejected_when_another_window_keeps_root_active() {
  let (_directory, registry, workspace) = fixture().await;
  let other = registry
    .open_async("second", Some(&workspace.root_info().path), false)
    .await
    .unwrap();
  let held = workspace.mutation.lock().await;
  let transition = registry.open_async("main", None, false);
  tokio::pin!(transition);
  assert!(futures_util::poll!(&mut transition).is_pending());
  let edit = async {
    let _guard = registry.lock_binding("main", &workspace).await?;
    workspace.write_file_under_lock("a.md", "stale edit").await
  };
  tokio::pin!(edit);
  assert!(futures_util::poll!(&mut edit).is_pending());
  drop(held);
  transition.await.unwrap();
  assert_eq!(edit.await.unwrap_err().code, "STALE_SESSION");
  assert_eq!(other.read_file("a.md").await.unwrap(), "A😀B\n");
  other.ensure_active().unwrap();
}

#[tokio::test]
async fn overlapping_folder_and_single_file_windows_cannot_both_replace_the_same_disk_baseline() {
  let (directory, registry, folder) = fixture().await;
  let path = directory.path().join("notes/a.md");
  let single = registry
    .open_async("single", Some(path.to_str().unwrap()), true)
    .await
    .unwrap();
  folder.open_file("a.md").await.unwrap();
  single.open_file("a.md").await.unwrap();
  folder.write_file("a.md", "folder edit").await.unwrap();
  single.write_file("a.md", "single edit").await.unwrap();
  let (first, second) = tokio::join!(folder.flush_buffers(), single.flush_buffers());
  assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
  let error = first.err().or_else(|| second.err()).unwrap();
  assert_eq!(error.code, "FILE_CONFLICT");
  let dirty = usize::from(folder.buffer_status("a.md").await.unwrap().unwrap().dirty)
    + usize::from(single.buffer_status("a.md").await.unwrap().unwrap().dirty);
  assert_eq!(dirty, 1, "The rejected window must retain its unsaved text");
}
