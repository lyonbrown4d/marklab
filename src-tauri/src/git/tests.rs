use super::test_support::Repository;
use super::*;
use std::path::Path;
#[test]
fn rejects_unsafe_paths() {
    for value in [
        "../outside",
        ".git/config",
        "nested/.GIT/config",
        "/etc/passwd",
        "C:/a",
        "nested\\a",
        "a//b",
        "./a",
    ] {
        assert!(safety::file_path(value).is_err(), "{value}");
    }
    #[cfg(unix)]
    assert!(safety::file_path(":(glob)**").is_ok());
    #[cfg(windows)]
    assert!(safety::file_path(":(glob)**").is_err());
}
#[test]
fn preview_rejects_binary_encoding_and_size() {
    assert_eq!(preview::decode(vec![0]).unwrap_err(), "binary");
    assert_eq!(
        preview::decode(vec![255]).unwrap_err(),
        "unsupported_encoding"
    );
    assert_eq!(
        preview::decode(vec![b'a'; preview::MAX_PREVIEW + 1]).unwrap_err(),
        "too_large"
    );
}
#[test]
fn credentials_are_redacted() {
    let text = process::redact("fatal: https://user:secret@example.org/repo failed");
    assert!(!text.contains("secret"));
}
#[tokio::test]
async fn repository_boundary_and_unsafe_configuration() {
    let repo = Repository::new().await;
    let nested = repo.root().join("nested");
    std::fs::create_dir(&nested).unwrap();
    assert!(!safety::repository(&nested, true).await.unwrap());
    assert!(safety::repository(&nested, false).await.is_err());
    process::repository(repo.root(), |repo| {
        repo.config()?.set_str("filter.evil.clean", "echo unsafe")?;
        Ok(())
    })
    .await
    .unwrap();
    assert!(safety::repository(repo.root(), false).await.is_err());
}
#[tokio::test]
async fn clean_worktree_and_literal_pathspec() {
    let repo = Repository::new().await;
    repo.commit("one").await;
    assert_literal_stage(&repo, "literal[1].md").await;
}
#[cfg(unix)]
#[tokio::test]
async fn unix_pathspec_prefix_is_a_literal_filename() {
    let repo = Repository::new().await;
    repo.commit("one").await;
    assert_literal_stage(&repo, ":(glob)**").await;
}
async fn assert_literal_stage(repo: &Repository, name: &str) {
    std::fs::write(repo.root().join(name), "literal").unwrap();
    assert!(
        process::repository(repo.root(), |repository| status::clean_now(repository))
            .await
            .is_err()
    );
    let snapshot = local::paths(
        repo.root(),
        "stage",
        &types::PathsRequest {
            expected_root: None,
            paths: vec![name.into()],
        },
    )
    .await
    .unwrap();
    assert_eq!(snapshot.staged.len(), 1);
    assert_eq!(snapshot.staged[0].path, name);
}
#[cfg(unix)]
#[tokio::test]
async fn symlink_paths_are_refused() {
    use std::os::unix::fs::symlink;
    let repo = Repository::new().await;
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("secret"), "safe").unwrap();
    symlink(outside.path(), repo.root().join("escape")).unwrap();
    assert!(safety::worktree_file(repo.root(), "escape/secret").is_err());
}
#[tokio::test]
async fn mutation_locks_are_shared_and_reclaimed() {
    let state = GitState::default();
    let a = state.lock(Path::new("a")).await;
    let b = state.lock(Path::new("a")).await;
    assert!(std::sync::Arc::ptr_eq(&a, &b));
    drop(a);
    drop(b);
    let _ = state.lock(Path::new("b")).await;
    assert_eq!(state.locks.lock().await.len(), 1);
}

#[tokio::test]
async fn index_rename_reports_destination_and_preview() {
    let repo = Repository::new().await;
    repo.commit("rename\n").await;
    std::fs::rename(repo.root().join("file.txt"), repo.root().join("new.txt")).unwrap();
    local::paths(
        repo.root(),
        "stage",
        &types::PathsRequest {
            expected_root: None,
            paths: vec!["file.txt".into(), "new.txt".into()],
        },
    )
    .await
    .unwrap();
    let snapshot = status::status(repo.root()).await.unwrap();
    assert_eq!(snapshot.staged.len(), 1);
    assert_eq!(snapshot.staged[0].path, "new.txt");
    assert_eq!(snapshot.staged[0].old_path.as_deref(), Some("file.txt"));
    let diff = preview::file_diff(
        repo.root(),
        &types::DiffRequest {
            expected_root: None,
            path: "new.txt".into(),
            section: "staged".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(diff.original_content, "rename\n");
    assert_eq!(diff.modified_content, "rename\n");
}

#[tokio::test]
async fn missing_identity_field_preserves_configured_name() {
    let repo = Repository::new().await;
    process::repository(repo.root(), |repository| {
        let mut config = repository.config()?;
        config.set_str("user.email", "")?;
        config.set_str("user.name", "Configured Name")?;
        let signature = process::signature(repository)?;
        assert_eq!(signature.name().unwrap(), "Configured Name");
        assert_eq!(signature.email().unwrap(), "marklab@local");
        Ok(())
    })
    .await
    .unwrap();
}
