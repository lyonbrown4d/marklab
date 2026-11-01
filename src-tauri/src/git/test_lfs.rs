use super::{
  GitState,
  cache::{Query, Value},
  process, safety,
  test_support::Repository,
};

#[tokio::test]
async fn standard_lfs_configuration_allows_read_queries_without_changing_the_repository() {
  let repo = Repository::new().await;
  repo.commit("base\n").await;
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
  std::fs::write(repo.root().join("file.txt"), "edited\n").unwrap();
  std::fs::write(repo.root().join(".gitattributes"), "*.bin filter=lfs\n").unwrap();
  std::fs::write(repo.root().join("asset.bin"), b"binary\0asset").unwrap();
  let config_before = std::fs::read(repo.root().join(".git/config")).unwrap();
  let index_before = std::fs::read(repo.root().join(".git/index")).unwrap();
  let state = GitState::default();
  let value = state.query(repo.root(), Query::Status).await.unwrap();
  let Value::Status(status) = value.as_ref() else {
    panic!("status expected")
  };
  assert!(status.repo.is_repository);
  assert!(status.unstaged.iter().any(|file| file.path == "file.txt"));
  assert!(status.untracked.iter().any(|file| file.path == "asset.bin"));
  assert!(
    state
      .query(
        repo.root(),
        Query::History {
          limit: Some(10),
          skip: Some(0)
        }
      )
      .await
      .is_ok()
  );
  assert_eq!(
    std::fs::read(repo.root().join(".git/config")).unwrap(),
    config_before
  );
  assert_eq!(
    std::fs::read(repo.root().join(".git/index")).unwrap(),
    index_before
  );
  assert_eq!(
    safety::repository(repo.root(), false)
      .await
      .unwrap_err()
      .code,
    "git_lfs_write_unsupported"
  );
}

#[tokio::test]
async fn lfs_named_shell_commands_and_other_custom_filters_remain_rejected_for_queries() {
  let repo = Repository::new().await;
  for (key, value) in [
    (
      "filter.lfs.clean",
      "git-lfs clean -- %f; touch MUST_NOT_EXIST",
    ),
    ("filter.lfs.smudge", "sh -c 'touch MUST_NOT_EXIST'"),
    (
      "filter.lfs.process",
      "git-lfs filter-process && touch MUST_NOT_EXIST",
    ),
    ("filter.other.clean", "git-lfs clean -- %f"),
  ] {
    process::repository(repo.root(), move |repository| {
      let mut config = repository.config()?;
      config.set_str("filter.lfs.process", "git-lfs filter-process")?;
      config.set_str(key, value)?;
      Ok(())
    })
    .await
    .unwrap();
    let state = GitState::default();
    assert_eq!(
      state
        .query(repo.root(), Query::Status)
        .await
        .err()
        .unwrap()
        .code,
      "git_unsafe_configuration"
    );
    assert!(!repo.root().join("MUST_NOT_EXIST").exists());
    process::repository(repo.root(), move |repository| {
      repository.config()?.remove(key)?;
      Ok(())
    })
    .await
    .unwrap();
  }
}
