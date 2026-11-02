use super::*;

#[test]
fn committed_lfs_config_can_separate_upload_and_download_endpoints() {
  let directory = tempfile::tempdir().unwrap();
  let repo = git2::Repository::init(directory.path()).unwrap();
  std::fs::write(
    directory.path().join(".lfsconfig"),
    "[lfs]\nurl = https://download.example/lfs\npushurl = https://upload.example/lfs\n",
  )
  .unwrap();
  assert_eq!(
    file_endpoint(&repo, "remote.origin.lfsurl", false)
      .unwrap()
      .as_deref(),
    Some("https://download.example/lfs")
  );
  assert_eq!(
    file_endpoint(&repo, "remote.origin.lfsurl", true)
      .unwrap()
      .as_deref(),
    Some("https://upload.example/lfs")
  );
}

#[test]
fn endpoints_use_https_without_forwarding_ssh_usernames_or_ports() {
  for remote in [
    "git@example.com:team/repo",
    "ssh://git@example.com:2222/team/repo.git",
  ] {
    assert_eq!(
      derived_endpoint(remote).unwrap().as_str(),
      "https://example.com/team/repo.git/info/lfs"
    );
  }
  for endpoint in [
    "http://example.com/lfs",
    "https://user:token@example.com/lfs",
    "https://example.com/lfs#fragment",
    "file:///tmp/lfs",
  ] {
    assert!(validate_url(endpoint).is_err());
  }
}
