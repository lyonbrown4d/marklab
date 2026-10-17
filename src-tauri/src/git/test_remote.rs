use super::{test_support::Repository, *};
#[tokio::test]
async fn remote_push_fetch_pull_and_branch_operations() {
    let source = Repository::new().await;
    source.commit("first\n").await;
    let parent = tempfile::tempdir().unwrap();
    let remote_path = parent.path().join("remote.git");
    std::fs::create_dir(&remote_path).unwrap();
    let bare = remote_path.clone();
    crate::blocking::run(move || {
        let mut options = git2::RepositoryInitOptions::new();
        options.bare(true).initial_head("main");
        git2::Repository::init_opts(bare, &options)?;
        Ok(())
    })
    .await
    .unwrap();
    remote::configure(
        source.root(),
        &types::RemoteRequest {
            expected_root: None,
            name: "origin".into(),
            url: Some(remote_path.to_string_lossy().into()),
        },
        false,
    )
    .await
    .unwrap();
    let push = types::NetworkRequest {
        expected_root: None,
        remote: Some("origin".into()),
        set_upstream: Some(true),
    };
    let remote_status = remote::network(source.root(), &push, "push").await.unwrap();
    assert_eq!(remote_status.upstream.as_deref(), Some("origin/main"));
    let checkout = parent.path().join("checkout");
    clone_repository(
        &GitState::default(),
        remote_path.to_str().unwrap(),
        &checkout,
        None,
        std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    )
    .await
    .unwrap();
    source.commit("second\n").await;
    remote::network(source.root(), &push, "push").await.unwrap();
    let request = types::NetworkRequest {
        expected_root: None,
        remote: None,
        set_upstream: None,
    };
    let fetched = remote::network(&checkout, &request, "fetch").await.unwrap();
    assert_eq!(fetched.behind, 1);
    remote::network(&checkout, &request, "pull").await.unwrap();
    assert_eq!(
        std::fs::read_to_string(checkout.join("file.txt")).unwrap(),
        "second\n"
    );
    let branch = |name: &str| types::BranchRequest {
        expected_root: None,
        name: name.into(),
        start_point: None,
        force: None,
    };
    local::branch_action(&checkout, "create", &branch("feature"))
        .await
        .unwrap();
    local::branch_action(&checkout, "switch", &branch("feature"))
        .await
        .unwrap();
    std::fs::write(checkout.join("feature.txt"), "feature\n").unwrap();
    assert!(
        local::branch_action(&checkout, "switch", &branch("main"))
            .await
            .is_err()
    );
    local::commit(&checkout, "feature", true).await.unwrap();
    local::branch_action(&checkout, "switch", &branch("main"))
        .await
        .unwrap();
    local::branch_action(&checkout, "merge", &branch("feature"))
        .await
        .unwrap();
    assert!(checkout.join("feature.txt").exists());
    local::branch_action(&checkout, "delete", &branch("feature"))
        .await
        .unwrap();
    assert!(
        !history::branches(&checkout)
            .await
            .unwrap()
            .iter()
            .any(|v| v.name == "feature")
    );
}
#[tokio::test]
async fn interactive_rebase_execution_steps_are_refused() {
    let repo = Repository::new().await;
    repo.commit("base\n").await;
    let directory = repo.root().join(".git/rebase-merge");
    std::fs::create_dir(&directory).unwrap();
    std::fs::write(
        directory.join("git-rebase-todo"),
        "exec touch MUST_NOT_EXIST\n",
    )
    .unwrap();
    assert_eq!(
        status::operation(repo.root())
            .await
            .unwrap()
            .operation
            .as_deref(),
        Some("rebase")
    );
    let failure = local::sequence(repo.root(), false).await.err().unwrap();
    assert_eq!(failure.code, "git_unsafe_configuration");
    assert!(!repo.root().join("MUST_NOT_EXIST").exists());
}
#[test]
fn remote_urls_reject_helpers_and_embedded_tokens() {
    for url in [
        "ext::touch /tmp/a",
        "https://user:secret@example.org/repo",
        "https://example.org/repo?token=secret",
        "http://example.org/repo",
        "-upload-pack=bad",
    ] {
        assert!(remote::url(url).is_err(), "{url}");
    }
    for url in [
        "git@example.org:org/repo.git",
        "https://example.org/repo.git",
        "ssh://git@example.org/repo.git",
        "/tmp/local.git",
    ] {
        assert!(remote::url(url).is_ok(), "{url}");
    }
}
