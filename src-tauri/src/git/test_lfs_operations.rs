use super::{history, lfs, local, process, status, test_support::Repository, types};
use sha2::{Digest, Sha256};
use std::{io::Cursor, path::PathBuf};

const ORIGINAL: &[u8] = b"original\0binary\xffasset\n";
const MODIFIED: &[u8] = b"modified\0binary\xfeasset\n";

async fn lfs_repository() -> Repository {
  let repo = Repository::new().await;
  process::repository(repo.root(), |repository| {
    let mut config = repository.config()?;
    config.set_str("filter.lfs.clean", "git-lfs clean -- %f")?;
    config.set_str("filter.lfs.smudge", "git-lfs smudge -- %f")?;
    config.set_str("filter.lfs.process", "git-lfs filter-process")?;
    config.set_bool("filter.lfs.required", true)?;
    Ok(())
  })
  .await
  .unwrap();
  std::fs::write(
    repo.root().join(".gitattributes"),
    "*.bin filter=lfs diff=lfs merge=lfs -text\n",
  )
  .unwrap();
  std::fs::write(repo.root().join("asset.bin"), ORIGINAL).unwrap();
  repo
}

fn asset_request() -> types::PathsRequest {
  types::PathsRequest {
    expected_root: None,
    paths: vec!["asset.bin".into()],
  }
}

fn object_path(repo: &Repository, bytes: &[u8]) -> PathBuf {
  let oid = hex::encode(Sha256::digest(bytes));
  repo
    .root()
    .join(".git/lfs/objects")
    .join(&oid[..2])
    .join(&oid[2..4])
    .join(&oid)
}

async fn assert_clean(repo: &Repository) {
  let snapshot = status::status(repo.root()).await.unwrap();
  assert!(snapshot.staged.is_empty());
  assert!(snapshot.unstaged.is_empty());
  assert!(snapshot.untracked.is_empty());
  assert!(snapshot.conflicts.is_empty());
}

#[tokio::test]
async fn lfs_stage_commit_discard_and_branch_switch_preserve_binary_content() {
  let repo = lfs_repository().await;
  local::paths(repo.root(), "stage", &asset_request())
    .await
    .unwrap();
  let expected_pointer = format!(
    "version https://git-lfs.github.com/spec/v1\noid sha256:{}\nsize {}\n",
    hex::encode(Sha256::digest(ORIGINAL)),
    ORIGINAL.len()
  );
  let indexed = process::repository(repo.root(), |repository| {
    let index = repository.index()?;
    let entry = index
      .get_path(std::path::Path::new("asset.bin"), 0)
      .unwrap();
    Ok(repository.find_blob(entry.id)?.content().to_vec())
  })
  .await
  .unwrap();
  assert_eq!(indexed, expected_pointer.as_bytes());
  assert_eq!(
    std::fs::read(object_path(&repo, ORIGINAL)).unwrap(),
    ORIGINAL
  );
  local::commit(repo.root(), "LFS asset", true).await.unwrap();
  let committed = process::repository(repo.root(), |repository| {
    let tree = repository.head()?.peel_to_tree()?;
    let entry = tree.get_path(std::path::Path::new("asset.bin"))?;
    Ok(repository.find_blob(entry.id())?.content().to_vec())
  })
  .await
  .unwrap();
  assert_eq!(committed, expected_pointer.as_bytes());
  let preview = process::repository(repo.root(), |repository| {
    let tree = repository.head()?.peel_to_tree()?;
    let entry = tree.get_path(std::path::Path::new("asset.bin"))?;
    super::preview::object_bytes(repository, entry.id())
  })
  .await
  .unwrap();
  assert_eq!(preview, ORIGINAL);
  assert_eq!(
    std::fs::read(repo.root().join("asset.bin")).unwrap(),
    ORIGINAL
  );
  assert_clean(&repo).await;

  std::fs::write(repo.root().join("asset.bin"), MODIFIED).unwrap();
  let snapshot = status::status(repo.root()).await.unwrap();
  assert!(
    snapshot
      .unstaged
      .iter()
      .any(|entry| entry.path == "asset.bin")
  );
  local::paths(repo.root(), "discard", &asset_request())
    .await
    .unwrap();
  assert_eq!(
    std::fs::read(repo.root().join("asset.bin")).unwrap(),
    ORIGINAL
  );
  assert_clean(&repo).await;

  repo.branch("create", "side").await;
  std::fs::write(repo.root().join("asset.bin"), MODIFIED).unwrap();
  local::commit(repo.root(), "changed LFS asset", true)
    .await
    .unwrap();
  repo.branch("switch", "side").await;
  assert_eq!(
    std::fs::read(repo.root().join("asset.bin")).unwrap(),
    ORIGINAL
  );
  assert_clean(&repo).await;
  repo.branch("switch", "main").await;
  assert_eq!(
    std::fs::read(repo.root().join("asset.bin")).unwrap(),
    MODIFIED
  );
  assert_clean(&repo).await;
}

#[tokio::test]
async fn lfs_stash_save_and_apply_restore_binary_content() {
  let repo = lfs_repository().await;
  local::commit(repo.root(), "LFS asset", true).await.unwrap();
  std::fs::write(repo.root().join("asset.bin"), MODIFIED).unwrap();
  local::stash_save(
    repo.root(),
    &types::StashSaveRequest {
      expected_root: None,
      message: Some("binary change".into()),
    },
  )
  .await
  .unwrap();
  assert_eq!(
    std::fs::read(repo.root().join("asset.bin")).unwrap(),
    ORIGINAL
  );
  assert_clean(&repo).await;
  let stash = history::stashes(repo.root()).await.unwrap().remove(0);
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
  assert_eq!(
    std::fs::read(repo.root().join("asset.bin")).unwrap(),
    MODIFIED
  );
  assert!(
    status::status(repo.root())
      .await
      .unwrap()
      .unstaged
      .iter()
      .any(|entry| entry.path == "asset.bin")
  );
}

#[tokio::test]
async fn lfs_smudge_rejects_missing_and_same_sized_corrupt_objects() {
  let repo = lfs_repository().await;
  let mut pointer = Vec::new();
  lfs::clean(repo.root(), &mut Cursor::new(ORIGINAL), &mut pointer).unwrap();
  let object = object_path(&repo, ORIGINAL);
  std::fs::remove_file(&object).unwrap();
  let mut output = Vec::new();
  assert!(lfs::smudge(repo.root(), &mut Cursor::new(&pointer), &mut output).is_err());
  assert!(output.is_empty());

  let mut corrupt = ORIGINAL.to_vec();
  corrupt[0] ^= 1;
  std::fs::write(&object, corrupt).unwrap();
  assert!(lfs::smudge(repo.root(), &mut Cursor::new(&pointer), &mut output).is_err());
  assert!(output.is_empty());
}

#[tokio::test]
async fn failed_lfs_checkout_keeps_existing_files_and_head() {
  let repo = lfs_repository().await;
  local::commit(repo.root(), "original", true).await.unwrap();
  repo.branch("create", "original").await;
  std::fs::write(repo.root().join("asset.bin"), MODIFIED).unwrap();
  local::commit(repo.root(), "modified", true).await.unwrap();
  let before = status::repo(repo.root()).await.unwrap().head;
  let original_object = object_path(&repo, ORIGINAL);
  std::fs::remove_file(&original_object).unwrap();
  let switch = types::BranchRequest {
    expected_root: None,
    name: "original".into(),
    start_point: None,
    force: None,
  };
  for corrupt in [false, true] {
    if corrupt {
      let mut bytes = ORIGINAL.to_vec();
      bytes[0] ^= 1;
      std::fs::write(&original_object, bytes).unwrap();
    }
    assert!(
      local::branch_action(repo.root(), "switch", &switch)
        .await
        .is_err()
    );
    assert_eq!(
      std::fs::read(repo.root().join("asset.bin")).unwrap(),
      MODIFIED
    );
    assert_eq!(status::repo(repo.root()).await.unwrap().head, before);
  }
  std::fs::write(repo.root().join("asset.bin"), b"unsaved local bytes\0").unwrap();
  std::fs::remove_file(object_path(&repo, MODIFIED)).unwrap();
  assert!(
    local::paths(repo.root(), "discard", &asset_request())
      .await
      .is_err()
  );
  assert_eq!(
    std::fs::read(repo.root().join("asset.bin")).unwrap(),
    b"unsaved local bytes\0"
  );
  assert_eq!(status::repo(repo.root()).await.unwrap().head, before);
}
