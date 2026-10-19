use super::{
  conflict::Stage,
  process::{self, error},
};
use crate::error::BackendResult;
use std::path::Path;
pub fn verify(root: &Path, file: &str, expected: &[Stage]) -> BackendResult<()> {
  verify_now(&process::open(root)?, file, expected)
}
pub fn verify_now(repo: &git2::Repository, file: &str, expected: &[Stage]) -> BackendResult<()> {
  let stale = || {
    error(
      "git_invalid_input",
      "Conflict index changed outside this editor; refresh before saving",
    )
  };
  let index = repo.index()?;
  let conflict = index.conflict_get(Path::new(file)).map_err(|_| stale())?;
  let actual = [conflict.ancestor, conflict.our, conflict.their];
  if actual.iter().flatten().count() != expected.len() {
    return Err(stale());
  }
  for stage in expected {
    let entry = actual
      .get(stage.stage as usize - 1)
      .and_then(Option::as_ref)
      .ok_or_else(stale)?;
    if entry.id.to_string() != stage.hash || format!("{:o}", entry.mode) != stage.mode {
      return Err(stale());
    }
  }
  Ok(())
}
