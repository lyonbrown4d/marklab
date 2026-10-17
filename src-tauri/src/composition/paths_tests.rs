use super::*;

#[tokio::test]
async fn native_test_paths_require_existing_canonical_separate_directories() -> BackendResult<()> {
    let temporary = tempfile::tempdir()?;
    let root = tokio::fs::canonicalize(temporary.path()).await?;
    let data = root.join("data");
    let cache = root.join("cache");
    tokio::fs::create_dir(&data).await?;
    tokio::fs::create_dir(&cache).await?;
    let paths = AppPaths::isolated(Some(data.clone()), Some(cache.clone())).await?;
    assert_eq!(paths.data_dir, data.join("v1"));
    assert_eq!(paths.cache_dir, cache);
    assert!(!paths.data_dir.exists());

    let file = root.join("file");
    tokio::fs::write(&file, b"not a directory").await?;
    for (data, cache) in [
        (None, Some(cache.clone())),
        (Some(data.clone()), None),
        (Some(PathBuf::from("relative")), Some(cache.clone())),
        (Some(root.join("missing")), Some(cache.clone())),
        (Some(file), Some(cache.clone())),
        (Some(data.clone()), Some(data.clone())),
        (Some(root.clone()), Some(cache.clone())),
        (Some(data), Some(root.clone())),
        (Some(root.join("cache/..")), Some(cache)),
    ] {
        let error = AppPaths::isolated(data, cache).await.err();
        assert_eq!(
            error.as_ref().map(|error| error.code.as_str()),
            Some("E2E_PATHS_INVALID")
        );
    }
    Ok(())
}
