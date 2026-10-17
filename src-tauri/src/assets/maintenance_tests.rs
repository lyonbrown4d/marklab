use super::*;

#[cfg(unix)]
#[test]
fn startup_refuses_linked_cache_directories_without_deleting_external_files() {
    for linked_component in ["cache", "cache/assets"] {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let source = outside.path().join("source.md");
        std::fs::write(&source, "external source").unwrap();
        let link = directory.path().join(linked_component);
        std::fs::create_dir_all(link.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(outside.path(), link).unwrap();
        let error = AssetService::new(directory.path()).err().unwrap();
        assert_eq!(error.code, "INVALID_ASSET_CACHE");
        assert_eq!(std::fs::read_to_string(source).unwrap(), "external source");
    }
}

#[test]
fn startup_removes_crash_snapshots_without_touching_sources_or_subdirectories() {
    let directory = tempfile::tempdir().unwrap();
    let cache = directory.path().join("cache/assets");
    std::fs::create_dir_all(cache.join("untouched")).unwrap();
    std::fs::write(cache.join("orphan.bin"), "crash snapshot").unwrap();
    let source = directory.path().join("source.md");
    std::fs::write(&source, "source").unwrap();
    let _service = AssetService::new(directory.path()).unwrap();
    assert!(!cache.join("orphan.bin").exists());
    assert!(cache.join("untouched").is_dir());
    assert_eq!(std::fs::read_to_string(source).unwrap(), "source");
}

#[test]
fn expired_capabilities_remove_only_temporary_files_without_another_preview_request() {
    let directory = tempfile::tempdir().unwrap();
    let service = AssetService::new(directory.path()).unwrap();
    let source = directory.path().join("source.md");
    std::fs::write(&source, "source").unwrap();
    service.issue_path("first", &source, true).unwrap();
    let snapshot = service
        .issue_bytes("first", b"snapshot", "copy.txt", "text/plain")
        .unwrap();
    let snapshot_path = service
        .resolve_capability_path("first", &snapshot.url)
        .unwrap();
    let mut grants = service.grants.lock().unwrap();
    maintenance::expire(&mut grants, snapshot.expires_at_ms + 1);
    assert!(grants.is_empty());
    assert!(!snapshot_path.exists());
    assert_eq!(std::fs::read_to_string(source).unwrap(), "source");
}

#[test]
fn snapshot_budget_preserves_active_previews_and_removes_rejected_copy() {
    let directory = tempfile::tempdir().unwrap();
    let service = AssetService::new(directory.path()).unwrap();
    // Sparse files test the real disk-length budget without allocating large buffers.
    let first = service.create_snapshot("first.pdf").unwrap();
    first.as_file().set_len(300 * 1024 * 1024).unwrap();
    let capability = service
        .issue_snapshot("first", first, "first.pdf", "application/pdf")
        .unwrap();
    let path = service
        .resolve_capability_path("first", &capability.url)
        .unwrap();
    let second = service.create_snapshot("second.pdf").unwrap();
    let rejected_path = second.path().to_owned();
    second.as_file().set_len(300 * 1024 * 1024).unwrap();
    assert_eq!(
        service
            .issue_snapshot("second", second, "second.pdf", "application/pdf")
            .unwrap_err()
            .code,
        "ASSET_LIMIT"
    );
    assert!(!rejected_path.exists());
    assert!(path.exists());
    service.revoke_window("first").unwrap();
    assert!(!path.exists());
    let source = directory.path().join("large.pdf");
    std::fs::File::create(&source)
        .unwrap()
        .set_len(1024 * 1024 * 1024)
        .unwrap();
    assert!(service.issue_path("first", &source, true).is_ok());
}
