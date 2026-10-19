use crate::error::{BackendError, BackendResult};

pub fn normalize_path(path: &str) -> BackendResult<String> {
  let portable = path.replace('\\', "/");
  if portable.trim().is_empty()
    || portable.contains('\0')
    || portable.starts_with('/')
    || portable.contains(':')
    || portable.split('/').any(|segment| segment == "..")
  {
    return Err(BackendError::new(
      "invalid_history_path",
      "History path must be a workspace-relative path without parent segments",
    ));
  }
  let normalized = portable
    .split('/')
    .filter(|part| !part.is_empty() && *part != ".")
    .collect::<Vec<_>>()
    .join("/");
  if normalized.is_empty() {
    return Err(BackendError::new(
      "invalid_history_path",
      "History path is empty",
    ));
  }
  Ok(normalized)
}
pub fn validate_entry_id(id: &str) -> BackendResult<()> {
  let valid = id.is_ascii()
    && id.len() == 50
    && id.as_bytes().get(13) == Some(&b'-')
    && id[..13].bytes().all(|byte| byte.is_ascii_digit())
    && uuid::Uuid::parse_str(&id[14..]).is_ok();
  if !valid {
    return Err(BackendError::new(
      "invalid_history_id",
      "Invalid local history entry ID",
    ));
  }
  Ok(())
}
