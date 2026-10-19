use super::test_support::Repository;
use super::*;
#[tokio::test]
async fn index_commit_history_reset_and_stash() {
  let repo = Repository::new().await;
  repo.commit("one\n").await;
  let original = status::repo(repo.root()).await.unwrap().head.unwrap();
  std::fs::write(repo.root().join("file.txt"), "two\n").unwrap();
  let request = types::PathsRequest {
    expected_root: None,
    paths: vec!["file.txt".into()],
  };
  local::paths(repo.root(), "stage", &request).await.unwrap();
  let diff = preview::file_diff(
    repo.root(),
    &types::DiffRequest {
      expected_root: None,
      path: "file.txt".into(),
      section: "staged".into(),
    },
  )
  .await
  .unwrap();
  assert_eq!(diff.original_content, "one\n");
  assert_eq!(diff.modified_content, "two\n");
  local::commit(repo.root(), "second", false).await.unwrap();
  let history = history::history(
    repo.root(),
    &types::HistoryRequest {
      expected_root: None,
      limit: Some(10),
      skip: None,
    },
  )
  .await
  .unwrap();
  assert_eq!(history.len(), 2);
  let reset = local::reset(
    repo.root(),
    &types::RevisionRequest {
      expected_root: None,
      commit: original.clone(),
      mainline: None,
      mode: Some("hard".into()),
    },
  )
  .await
  .unwrap();
  assert!(reset.backup_branch.starts_with("marklab-backup-"));
  assert_eq!(reset.status.repo.head.as_deref(), Some(original.as_str()));
  std::fs::write(repo.root().join("new.txt"), "stash\n").unwrap();
  local::stash_save(
    repo.root(),
    &types::StashSaveRequest {
      expected_root: None,
      message: None,
    },
  )
  .await
  .unwrap();
  let stash = history::stashes(repo.root()).await.unwrap().remove(0);
  assert!(
    local::stash_action(
      repo.root(),
      &types::StashRequest {
        expected_root: None,
        r#ref: stash.r#ref.clone(),
        expected_hash: Some("0".repeat(40))
      },
      false
    )
    .await
    .is_err()
  );
  local::stash_action(
    repo.root(),
    &types::StashRequest {
      expected_root: None,
      r#ref: stash.r#ref,
      expected_hash: Some(stash.hash),
    },
    false,
  )
  .await
  .unwrap();
  assert!(repo.root().join("new.txt").is_file());
}
#[tokio::test]
async fn conflicts_require_current_revision_and_marker_free_result() {
  let repo = Repository::new().await;
  repo.commit("base\n").await;
  repo.branch("create", "side").await;
  repo.commit("ours\n").await;
  repo.branch("switch", "side").await;
  repo.commit("theirs\n").await;
  repo.branch("switch", "main").await;
  assert!(
    local::branch_action(
      repo.root(),
      "merge",
      &types::BranchRequest {
        expected_root: None,
        name: "side".into(),
        start_point: None,
        force: None
      }
    )
    .await
    .is_err()
  );
  let original = match conflict::read(repo.root(), "file.txt").await.unwrap() {
    conflict::ConflictPreview::Text(value) => value,
    _ => panic!("expected text conflict"),
  };
  assert_eq!(original.base.as_deref(), Some("base\n"));
  assert_eq!(original.ours.as_deref(), Some("ours\n"));
  assert_eq!(original.theirs.as_deref(), Some("theirs\n"));
  std::fs::write(repo.root().join("file.txt"), "external\n").unwrap();
  let mut request = types::ConflictSaveRequest {
    expected_root: None,
    path: "file.txt".into(),
    content: "resolved\n".into(),
    revision: original.revision,
    stage: Some(true),
    delete_file: None,
  };
  assert!(conflict::save(repo.root(), &request).await.is_err());
  assert_eq!(
    std::fs::read_to_string(repo.root().join("file.txt")).unwrap(),
    "external\n"
  );
  let current = match conflict::read(repo.root(), "file.txt").await.unwrap() {
    conflict::ConflictPreview::Text(value) => value,
    _ => panic!("expected text conflict"),
  };
  request.revision = current.revision;
  request.content = "<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs\n".into();
  assert!(conflict::save(repo.root(), &request).await.is_err());
  request.content = "resolved\n".into();
  let saved = conflict::save(repo.root(), &request).await.unwrap();
  assert!(saved.staged);
  assert!(saved.status.conflicts.is_empty());
  local::sequence(repo.root(), false).await.unwrap();
  assert!(
    status::operation(repo.root())
      .await
      .unwrap()
      .operation
      .is_none()
  );
}
#[tokio::test]
async fn clone_publishes_empty_target_and_cancellation_preserves_target() {
  let source = Repository::new().await;
  source.commit("clone me\n").await;
  let parent = tempfile::tempdir().unwrap();
  let target = parent.path().join("checkout");
  std::fs::create_dir(&target).unwrap();
  let state = GitState::default();
  let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
  let result = clone_repository(
    &state,
    source.root().to_str().unwrap(),
    &target,
    None,
    cancel.clone(),
  )
  .await
  .unwrap();
  assert!(result.is_repository);
  assert_eq!(
    std::fs::read_to_string(target.join("file.txt")).unwrap(),
    "clone me\n"
  );
  let cancelled = parent.path().join("cancelled");
  std::fs::create_dir(&cancelled).unwrap();
  cancel.store(true, std::sync::atomic::Ordering::Release);
  assert!(
    clone_repository(
      &state,
      source.root().to_str().unwrap(),
      &cancelled,
      None,
      cancel.clone()
    )
    .await
    .is_err()
  );
  assert_eq!(std::fs::read_dir(cancelled).unwrap().count(), 0);
}

#[tokio::test]
async fn stash_drop_checks_identity_and_removes_last_reference() {
  let repo = Repository::new().await;
  repo.commit("base\n").await;
  for text in ["one\n", "two\n"] {
    std::fs::write(repo.root().join("file.txt"), text).unwrap();
    local::stash_save(
      repo.root(),
      &types::StashSaveRequest {
        expected_root: None,
        message: None,
      },
    )
    .await
    .unwrap();
  }
  let entries = history::stashes(repo.root()).await.unwrap();
  for entry in entries.iter().rev() {
    let index = history::stashes(repo.root())
      .await
      .unwrap()
      .into_iter()
      .find(|value| value.hash == entry.hash)
      .unwrap();
    local::stash_action(
      repo.root(),
      &types::StashRequest {
        expected_root: None,
        r#ref: index.r#ref,
        expected_hash: Some(index.hash),
      },
      true,
    )
    .await
    .unwrap();
  }
  assert!(history::stashes(repo.root()).await.unwrap().is_empty());
}
