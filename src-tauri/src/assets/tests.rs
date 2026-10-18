use super::*;

#[test]
fn large_preview_head_and_ranges_never_read_the_entire_file() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("large.pdf");
    let length = 200 * 1024 * 1024;
    std::fs::File::create(&path)
        .unwrap()
        .set_len(length)
        .unwrap();
    let service = AssetService::new(directory.path()).unwrap();
    let capability = service.issue_path("first", &path, true).unwrap();
    let token = capability
        .url
        .strip_prefix("marklab-asset://local/v1/")
        .unwrap();
    let (body, mime, range, size) = service.serve("first", token, None, true).unwrap();
    assert!(body.is_empty());
    assert_eq!(mime, "application/pdf");
    assert_eq!(range, None);
    assert_eq!(size, length);
    let (body, _, range, size) = service
        .serve("first", token, Some("bytes=5-14"), false)
        .unwrap();
    assert_eq!(body, vec![0; 10]);
    assert_eq!(size, 10);
    assert_eq!(range, Some(format!("bytes 5-14/{length}")));
    assert_eq!(
        service.serve("first", token, None, false).unwrap_err().code,
        "ASSET_TOO_LARGE"
    );
}

#[test]
fn capabilities_reject_another_window_and_replaced_files() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("notes.txt");
    std::fs::write(&path, "original").unwrap();
    let service = AssetService::new(directory.path()).unwrap();
    let capability = service.issue_path("first", &path, true).unwrap();
    let token = capability
        .url
        .strip_prefix("marklab-asset://local/v1/")
        .unwrap();
    assert_eq!(
        service
            .serve("second", token, None, false)
            .unwrap_err()
            .code,
        "ASSET_EXPIRED"
    );
    std::fs::rename(&path, directory.path().join("old.txt")).unwrap();
    std::fs::write(&path, "replacement").unwrap();
    assert_eq!(
        service.serve("first", token, None, false).unwrap_err().code,
        "ASSET_CHANGED"
    );
}

#[test]
fn capabilities_reject_in_place_changes_between_pdf_range_requests() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("notes.txt");
    std::fs::write(&path, "original").unwrap();
    let service = AssetService::new(directory.path()).unwrap();
    let capability = service.issue_path("first", &path, true).unwrap();
    let token = capability
        .url
        .strip_prefix("marklab-asset://local/v1/")
        .unwrap();
    assert!(
        service
            .serve("first", token, Some("bytes=0-3"), false)
            .is_ok()
    );
    std::fs::write(&path, "changed!").unwrap();
    std::fs::File::options()
        .write(true)
        .open(&path)
        .unwrap()
        .set_times(std::fs::FileTimes::new().set_modified(std::time::SystemTime::UNIX_EPOCH))
        .unwrap();
    assert_eq!(
        service
            .serve("first", token, Some("bytes=4-7"), false)
            .unwrap_err()
            .code,
        "ASSET_CHANGED"
    );
}
