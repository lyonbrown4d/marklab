use super::super::{
  ConflictVersion,
  engine::{files, manifest::failure},
};
use crate::{error::BackendResult, workspace::Workspace};
use std::path::Path;
use tokio::sync::watch;
const PREVIEW_LIMIT: u64 = 64 * 1024;
pub async fn version(
  root: &Path,
  path: Option<&str>,
  cancel: &watch::Receiver<bool>,
) -> BackendResult<ConflictVersion> {
  let deleted = || ConflictVersion {
    hash: None,
    size: 0,
    text: None,
    unavailable: Some("deleted"),
  };
  let Some(path) = path else {
    return Ok(deleted());
  };
  let Some(fingerprint) = files::inspect(root, path, cancel).await? else {
    return Ok(deleted());
  };
  let (text, unavailable) = if fingerprint.size > PREVIEW_LIMIT {
    (None, Some("too_large"))
  } else {
    let target = files::resolve(root, path).await?;
    let bytes = tokio::fs::read(target).await?;
    files::assert_hash(root, path, Some(&fingerprint.hash), cancel).await?;
    if bytes.contains(&0) {
      (None, Some("binary"))
    } else {
      match String::from_utf8(bytes) {
        Ok(value) => (Some(value), None),
        Err(_) => (None, Some("binary")),
      }
    }
  };
  Ok(ConflictVersion {
    hash: Some(fingerprint.hash),
    size: fingerprint.size,
    text,
    unavailable,
  })
}
pub async fn backup(
  workspace: &Workspace,
  path: &str,
  hash: &str,
  size: u64,
  cancel: &watch::Receiver<bool>,
) -> BackendResult<String> {
  let original = Path::new(path);
  let stem = original
    .file_stem()
    .and_then(|v| v.to_str())
    .ok_or_else(|| failure("Invalid conflict path"))?;
  let extension = original
    .extension()
    .and_then(|v| v.to_str())
    .map(|v| format!(".{v}"))
    .unwrap_or_default();
  let parent = original
    .parent()
    .filter(|v| !v.as_os_str().is_empty())
    .map(|v| format!("{}/", v.to_string_lossy()))
    .unwrap_or_default();
  let backup = format!(
    "{parent}{stem}.resolved-local-{}{extension}",
    uuid::Uuid::new_v4()
  );
  let snapshot = files::snapshot(&workspace.root_directory(), path, hash, size, cancel).await?;
  files::publish(
    workspace,
    files::Publication {
      path: &backup,
      source: snapshot.path(),
      hash,
      size,
      expected: None,
      overwrite: false,
    },
    cancel,
  )
  .await?;
  Ok(backup)
}
