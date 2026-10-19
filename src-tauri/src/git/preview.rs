use super::{
  process::{self, error},
  safety,
  types::*,
};
use crate::error::BackendResult;
use std::{io::Read, path::Path};
pub const MAX_PREVIEW: usize = 1024 * 1024;
pub fn decode(bytes: Vec<u8>) -> Result<String, &'static str> {
  if bytes.len() > MAX_PREVIEW {
    return Err("too_large");
  }
  if bytes.contains(&0) {
    return Err("binary");
  }
  String::from_utf8(bytes).map_err(|_| "unsupported_encoding")
}
pub(super) fn read_worktree(
  root: &Path,
  file: &str,
) -> BackendResult<Result<String, &'static str>> {
  let selected = file;
  let path = safety::worktree_file(root, file)?;
  let mut options = std::fs::OpenOptions::new();
  options.read(true);
  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    options.custom_flags(libc::O_NOFOLLOW);
  }
  match options.open(&path) {
    Ok(file) => {
      let identity = same_file::Handle::from_file(file.try_clone()?)?;
      if !file.metadata()?.is_file() {
        return Err(error(
          "git_workspace_boundary",
          "Preview requires a regular file",
        ));
      }
      let mut bytes = Vec::new();
      file
        .take((MAX_PREVIEW + 1) as u64)
        .read_to_end(&mut bytes)?;
      safety::worktree_file(root, selected)?;
      if identity != same_file::Handle::from_path(&path)?
        || !std::fs::canonicalize(&path)?.starts_with(std::fs::canonicalize(root)?)
      {
        return Err(error(
          "git_workspace_boundary",
          "Preview file changed while reading",
        ));
      }
      Ok(decode(bytes))
    }
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Ok(String::new())),
    Err(e) => Err(e.into()),
  }
}
pub async fn worktree(root: &Path, file: &str) -> BackendResult<Result<String, &'static str>> {
  let root = root.to_owned();
  let file = file.to_owned();
  crate::blocking::run(move || read_worktree(&root, &file)).await
}
pub fn blob_id(
  repo: &git2::Repository,
  revision: Option<&str>,
  file: &str,
) -> BackendResult<Option<git2::Oid>> {
  safety::file_path(file)?;
  let (oid, mode) = if let Some(revision) = revision {
    let commit = if revision == "HEAD" {
      match repo.head().and_then(|v| v.peel_to_commit()) {
        Ok(value) => value,
        Err(error)
          if [git2::ErrorCode::UnbornBranch, git2::ErrorCode::NotFound].contains(&error.code()) =>
        {
          return Ok(None);
        }
        Err(error) => return Err(error.into()),
      }
    } else {
      safety::commit_now(repo, revision)?
    };
    let tree = commit.tree()?;
    let entry = match tree.get_path(Path::new(file)) {
      Ok(entry) => entry,
      Err(error) if error.code() == git2::ErrorCode::NotFound => return Ok(None),
      Err(error) => return Err(error.into()),
    };
    (entry.id(), entry.filemode() as u32)
  } else {
    let index = repo.index()?;
    let Some(entry) = index.get_path(Path::new(file), 0) else {
      return Ok(None);
    };
    (entry.id, entry.mode)
  };
  if ![0o100644, 0o100755].contains(&mode) {
    return Err(error(
      "git_workspace_boundary",
      "Only regular Git file blobs can be previewed",
    ));
  }
  Ok(Some(oid))
}
pub fn object_bytes(repo: &git2::Repository, oid: git2::Oid) -> BackendResult<Vec<u8>> {
  let odb = repo.odb()?;
  let (size, kind) = odb.read_header(oid)?;
  if kind != git2::ObjectType::Blob {
    return Err(error(
      "git_invalid_input",
      "Preview requires a regular Git file blob",
    ));
  }
  if size > MAX_PREVIEW {
    return Ok(vec![0; MAX_PREVIEW + 1]);
  }
  Ok(odb.read(oid)?.data().to_vec())
}
pub async fn read_object(root: &Path, hash: &str) -> BackendResult<Vec<u8>> {
  safety::hash(hash)?;
  let oid = git2::Oid::from_str(hash)?;
  process::repository(root, move |repo| object_bytes(repo, oid)).await
}
fn content(
  repo: &git2::Repository,
  revision: Option<&str>,
  file: &str,
) -> BackendResult<Result<String, &'static str>> {
  let bytes = if let Some(oid) = blob_id(repo, revision, file)? {
    object_bytes(repo, oid)?
  } else {
    Vec::new()
  };
  Ok(decode(bytes))
}
fn diff(
  file: String,
  old_path: Option<String>,
  original: Result<String, &str>,
  modified: Result<String, &str>,
  left: &str,
  right: &str,
) -> FileDiff {
  let unavailable_reason = original
    .as_ref()
    .err()
    .or_else(|| modified.as_ref().err())
    .map(|v| v.to_string());
  let (original_content, modified_content) = if unavailable_reason.is_some() {
    (String::new(), String::new())
  } else {
    (original.unwrap_or_default(), modified.unwrap_or_default())
  };
  FileDiff {
    path: file,
    old_path,
    original_label: left.into(),
    modified_label: right.into(),
    original_content,
    modified_content,
    unavailable_reason,
  }
}
pub async fn file_diff(root: &Path, request: &DiffRequest) -> BackendResult<FileDiff> {
  let file = safety::file_path(&request.path)?.to_owned();
  let section = request.section.clone();
  let root = root.to_owned();
  let inside = root.clone();
  process::repository(&root, move |repo| {
    let snapshot = super::status::status_now(repo)?;
    let group = match section.as_str() {
      "staged" => &snapshot.staged,
      "unstaged" => &snapshot.unstaged,
      "untracked" => &snapshot.untracked,
      "conflicts" => &snapshot.conflicts,
      _ => return Err(error("git_invalid_input", "Invalid diff section")),
    };
    let change = group.iter().find(|v| v.path == file).ok_or_else(|| {
      error(
        "git_invalid_input",
        "Git selection changed; refresh the file list",
      )
    })?;
    let old_path = change.old_path.clone();
    let original_file = old_path.as_deref().unwrap_or(&file);
    let (original, modified, left, right) = match section.as_str() {
      "staged" => (
        content(repo, Some("HEAD"), original_file)?,
        content(repo, None, &file)?,
        "HEAD",
        "Index",
      ),
      "conflicts" => (
        content(repo, Some("HEAD"), original_file)?,
        read_worktree(&inside, &file)?,
        "HEAD",
        "Working Tree",
      ),
      "untracked" => (
        Ok(String::new()),
        read_worktree(&inside, &file)?,
        "Empty",
        "Working Tree",
      ),
      _ => (
        content(repo, None, original_file)?,
        read_worktree(&inside, &file)?,
        "Index",
        "Working Tree",
      ),
    };
    Ok(diff(file, old_path, original, modified, left, right))
  })
  .await
}
pub async fn commit_diff(root: &Path, request: &CommitDiffRequest) -> BackendResult<FileDiff> {
  let hash = request.commit.clone();
  let file = safety::file_path(&request.path)?.to_owned();
  let requested_old = request.old_path.clone();
  process::repository(root, move |repo| {
    let commit = safety::commit_now(repo, &hash)?;
    let files = super::history::commit_files_now(repo, &hash)?;
    let change = files.iter().find(|v| v.path == file).ok_or_else(|| {
      error(
        "git_invalid_input",
        "Path is absent from the selected commit",
      )
    })?;
    if requested_old.is_some() && requested_old != change.old_path {
      return Err(error("git_invalid_input", "Commit rename source changed"));
    }
    let original = if commit.parent_count() > 0 {
      content(
        repo,
        Some(&commit.parent_id(0)?.to_string()),
        change.old_path.as_deref().unwrap_or(&file),
      )?
    } else {
      Ok(String::new())
    };
    let modified = content(repo, Some(&hash), &file)?;
    Ok(diff(
      file,
      change.old_path.clone(),
      original,
      modified,
      "Parent",
      &hash[..8],
    ))
  })
  .await
}
