use super::{adapter::Adapter, config::Config};

#[tokio::test]
async fn requires_existing_directories_and_canonicalizes_aliases() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    let engine = temp.path().join("engine");
    tokio::fs::create_dir(&source).await.unwrap();
    tokio::fs::create_dir(&engine).await.unwrap();
    let config = Config {
        workspace_root: source.join("missing"),
        engine_data_dir: engine.clone(),
        default_search_limit: 10,
    };
    assert!(config.canonicalize().await.is_err());
    tokio::fs::write(temp.path().join("file"), "source document")
        .await
        .unwrap();
    let config = Config {
        workspace_root: temp.path().join("file"),
        engine_data_dir: engine.clone(),
        default_search_limit: 10,
    };
    assert!(config.canonicalize().await.is_err());
    let config = Config {
        workspace_root: source.join("../source"),
        engine_data_dir: engine,
        default_search_limit: 10,
    }
    .canonicalize()
    .await
    .unwrap();
    assert_eq!(
        config.workspace_root,
        tokio::fs::canonicalize(source).await.unwrap()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn explicit_cache_cannot_follow_directory_or_database_symlinks() {
    let source = tempfile::tempdir().unwrap();
    let engine = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), engine.path().join("tauri-storage")).unwrap();
    let config = || Config {
        workspace_root: source.path().into(),
        engine_data_dir: engine.path().into(),
        default_search_limit: 10,
    };
    assert!(Adapter::open(config()).await.is_err());
    assert!(
        tokio::fs::read_dir(outside.path())
            .await
            .unwrap()
            .next_entry()
            .await
            .unwrap()
            .is_none()
    );
    tokio::fs::remove_file(engine.path().join("tauri-storage"))
        .await
        .unwrap();
    tokio::fs::create_dir(engine.path().join("tauri-storage"))
        .await
        .unwrap();
    let document = outside.path().join("source.md");
    tokio::fs::write(&document, "original").await.unwrap();
    std::os::unix::fs::symlink(
        &document,
        engine.path().join("tauri-storage/marklab.sqlite"),
    )
    .unwrap();
    assert!(Adapter::open(config()).await.is_err());
    assert_eq!(
        tokio::fs::read_to_string(document).await.unwrap(),
        "original"
    );
}
