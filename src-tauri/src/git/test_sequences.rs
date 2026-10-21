use super::types::CommitFileStatus;
use super::{test_support::Repository, *};
fn revision(hash: String) -> types::RevisionRequest {
  types::RevisionRequest {
    expected_root: None,
    commit: hash,
    mainline: None,
    mode: None,
  }
}
async fn resolve(repo: &Repository, content: &str) {
  let conflict::ConflictPreview::Text(current) =
    conflict::read(repo.root(), "file.txt").await.unwrap()
  else {
    panic!("text conflict required")
  };
  conflict::save(
    repo.root(),
    &types::ConflictSaveRequest {
      expected_root: None,
      path: "file.txt".into(),
      content: content.into(),
      revision: current.revision,
      stage: Some(true),
      delete_file: None,
    },
  )
  .await
  .unwrap();
}
#[tokio::test]
async fn cherry_pick_revert_and_commit_preview_use_library_objects() {
  let repo = Repository::new().await;
  repo.commit("base\n").await;
  repo.branch("create", "source").await;
  repo.branch("switch", "source").await;
  std::fs::write(repo.root().join("added.txt"), "added\n").unwrap();
  local::commit(repo.root(), "add file", true).await.unwrap();
  let source = status::repo(repo.root()).await.unwrap().head.unwrap();
  repo.branch("switch", "main").await;
  local::revision_action(repo.root(), "cherry-pick", &revision(source.clone()))
    .await
    .unwrap();
  assert_eq!(
    std::fs::read_to_string(repo.root().join("added.txt")).unwrap(),
    "added\n"
  );
  let files = history::commit_files(repo.root(), &source).await.unwrap();
  assert!(
    files
      .iter()
      .any(|file| file.path == "added.txt" && matches!(file.status, CommitFileStatus::A))
  );
  let picked = status::repo(repo.root()).await.unwrap().head.unwrap();
  local::revision_action(repo.root(), "revert", &revision(picked))
    .await
    .unwrap();
  assert!(!repo.root().join("added.txt").exists());
}
#[tokio::test]
async fn rebase_conflict_can_abort_then_continue() {
  let repo = Repository::new().await;
  repo.commit("base\n").await;
  repo.branch("create", "side").await;
  repo.commit("main\n").await;
  repo.branch("switch", "side").await;
  repo.commit("side\n").await;
  let before = status::repo(repo.root()).await.unwrap().head.unwrap();
  let request = types::BranchRequest {
    expected_root: None,
    name: "main".into(),
    start_point: None,
    force: None,
  };
  assert!(
    local::branch_action(repo.root(), "rebase", &request)
      .await
      .is_err()
  );
  assert_eq!(
    status::operation(repo.root())
      .await
      .unwrap()
      .operation
      .as_deref(),
    Some("rebase")
  );
  local::sequence(repo.root(), true).await.unwrap();
  assert_eq!(
    status::repo(repo.root()).await.unwrap().head.as_deref(),
    Some(before.as_str())
  );
  assert!(
    local::branch_action(repo.root(), "rebase", &request)
      .await
      .is_err()
  );
  resolve(&repo, "resolved\n").await;
  local::sequence(repo.root(), false).await.unwrap();
  assert!(
    status::operation(repo.root())
      .await
      .unwrap()
      .operation
      .is_none()
  );
  assert_eq!(
    status::repo(repo.root()).await.unwrap().branch.as_deref(),
    Some("side")
  );
}
#[tokio::test]
async fn sequencer_preserves_original_head_across_later_conflicts() {
  let repo = Repository::new().await;
  repo.commit("base\n").await;
  repo.branch("create", "source").await;
  repo.commit("ours\n").await;
  let original = status::repo(repo.root()).await.unwrap().head.unwrap();
  repo.branch("switch", "source").await;
  repo.commit("one\n").await;
  let first = status::repo(repo.root()).await.unwrap().head.unwrap();
  repo.commit("two\n").await;
  let second = status::repo(repo.root()).await.unwrap().head.unwrap();
  repo.branch("switch", "main").await;
  assert!(
    local::revision_action(repo.root(), "cherry-pick", &revision(first.clone()))
      .await
      .is_err()
  );
  let directory = repo.root().join(".git/sequencer");
  std::fs::create_dir(&directory).unwrap();
  std::fs::write(directory.join("head"), format!("{original}\n")).unwrap();
  std::fs::write(
    directory.join("todo"),
    format!("pick {first} one\npick {second} two\n"),
  )
  .unwrap();
  resolve(&repo, "custom\n").await;
  assert!(local::sequence(repo.root(), false).await.is_err());
  assert_eq!(
    std::fs::read_to_string(directory.join("head"))
      .unwrap()
      .trim(),
    original
  );
  assert!(
    !status::status(repo.root())
      .await
      .unwrap()
      .conflicts
      .is_empty()
  );
  local::sequence(repo.root(), true).await.unwrap();
  assert_eq!(
    status::repo(repo.root()).await.unwrap().head.as_deref(),
    Some(original.as_str())
  );
  assert_eq!(
    std::fs::read_to_string(repo.root().join("file.txt")).unwrap(),
    "ours\n"
  );
}
