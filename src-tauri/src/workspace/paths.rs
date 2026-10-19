use crate::error::{BackendError, BackendResult};
use std::path::{Component, Path, PathBuf};

pub fn relative_path(value: &str) -> BackendResult<PathBuf> {
  if value.is_empty()
    || value.len() > 32768
    || value.contains('\0')
    || value.contains('\\')
    || value.contains(':')
    || value.split('/').any(|part| part.is_empty() || part == ".")
  {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Expected a workspace-relative path",
    ));
  }
  let path = Path::new(value);
  if path
    .components()
    .any(|part| !matches!(part, Component::Normal(_)))
  {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Path must stay inside the workspace",
    ));
  }
  Ok(path.to_path_buf())
}

pub fn resolve(root: &Path, value: &str) -> BackendResult<PathBuf> {
  let relative = relative_path(value)?;
  let target = root.join(relative);
  let canonical_root = root.canonicalize()?;
  if canonical_root != root {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Workspace root identity changed",
    ));
  }
  // No symlink aliases: buffers have one stable relative identity and disk
  // operations must not follow a replaced parent into another directory.
  let mut checked = root.to_path_buf();
  for component in relative_path(value)?.components() {
    checked.push(component.as_os_str());
    match std::fs::symlink_metadata(&checked) {
      Ok(info) if info.file_type().is_symlink() => {
        return Err(BackendError::new(
          "INVALID_PATH",
          "Workspace symbolic links are not accessible",
        ));
      }
      Ok(_) => {}
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
      Err(error) => return Err(error.into()),
    }
  }
  let mut existing = target.as_path();
  while !existing.exists() {
    existing = existing
      .parent()
      .ok_or_else(|| BackendError::new("INVALID_PATH", "Path has no existing parent"))?;
  }
  let canonical_parent = existing.canonicalize()?;
  if !canonical_parent.starts_with(&canonical_root) {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Symlink escapes the workspace",
    ));
  }
  Ok(target)
}

pub fn display_relative(root: &Path, path: &Path) -> BackendResult<String> {
  let relative = path
    .strip_prefix(root)
    .map_err(|_| BackendError::new("INVALID_PATH", "Path is outside workspace"))?;
  Ok(relative.to_string_lossy().replace('\\', "/"))
}

pub fn fingerprint(content: &str) -> String {
  use sha2::{Digest, Sha256};
  hex::encode(Sha256::digest(content.as_bytes()))
}
