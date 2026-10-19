use super::{
  preview,
  process::{self, error},
  safety,
  types::OpenFileRequest,
};
use crate::error::BackendResult;
use std::{
  io::{Read, Write},
  path::{Path, PathBuf},
};
pub enum PreviewSource {
  Worktree {
    path: PathBuf,
    file: String,
    label: String,
  },
  Blob {
    hash: String,
    file: String,
    label: String,
  },
}
pub async fn source(root: &Path, request: &OpenFileRequest) -> BackendResult<PreviewSource> {
  let file = safety::file_path(&request.path)?.to_owned();
  let old = safety::file_path(request.old_path.as_deref().unwrap_or(&file))?.to_owned();
  let action = request.action.clone();
  let section = request.section.clone();
  let hash = request.commit.clone();
  let root = root.to_owned();
  let inside = root.clone();
  process::repository(&root, move |repo| {
    if !["preview", "system"].contains(&action.as_str())
      || section
        .as_deref()
        .is_some_and(|v| !["staged", "unstaged", "untracked", "conflicts"].contains(&v))
    {
      return Err(error(
        "git_invalid_input",
        "Invalid Git file open action or section",
      ));
    }
    let found = |oid: git2::Oid, file: &str, label: String| PreviewSource::Blob {
      hash: oid.to_string(),
      file: file.into(),
      label,
    };
    if let Some(hash) = hash {
      let commit = safety::commit_now(repo, &hash)?;
      if let Some(oid) = preview::blob_id(repo, Some(&hash), &file)? {
        return Ok(found(oid, &file, hash[..8].into()));
      }
      if commit.parent_count() > 0 {
        let parent = commit.parent_id(0)?.to_string();
        if let Some(oid) = preview::blob_id(repo, Some(&parent), &old)? {
          return Ok(found(oid, &old, parent[..8].into()));
        }
      }
    } else {
      if section.as_deref() != Some("staged") {
        let path = safety::worktree_file(&inside, &file)?;
        if path.is_file() {
          return Ok(PreviewSource::Worktree {
            path,
            file,
            label: "Working Tree".into(),
          });
        }
      }
      if let Some(oid) = preview::blob_id(repo, None, &file)? {
        return Ok(found(oid, &file, "Index".into()));
      }
      if section.as_deref() == Some("conflicts")
        && let Ok(conflict) = repo.index()?.conflict_get(Path::new(&file))
        && let Some(entry) = conflict.our.or(conflict.their)
        && [0o100644, 0o100755].contains(&entry.mode)
      {
        return Ok(found(entry.id, &file, "Conflict".into()));
      }
      if let Some(oid) = preview::blob_id(repo, Some("HEAD"), &old)? {
        return Ok(found(oid, &old, "HEAD".into()));
      }
    }
    Err(error(
      "git_invalid_input",
      "The selected Git file version is no longer available",
    ))
  })
  .await
}
pub async fn write_blob(root: &Path, hash: &str, mut file: std::fs::File) -> BackendResult<()> {
  safety::hash(hash)?;
  let oid = git2::Oid::from_str(hash)?;
  process::repository(root, move |repo| {
    let odb = repo.odb()?;
    let (size, kind) = odb.read_header(oid)?;
    if kind != git2::ObjectType::Blob {
      return Err(error("git_invalid_input", "Preview requires a blob"));
    }
    let (mut reader, _, _) = odb.reader(oid)?;
    let mut buffer = [0u8; 65536];
    let mut written = 0;
    loop {
      let count = reader.read(&mut buffer)?;
      if count == 0 {
        break;
      }
      file.write_all(&buffer[..count])?;
      written += count;
    }
    if written != size {
      return Err(error(
        "git_command_failed",
        "Git blob stream ended unexpectedly",
      ));
    }
    file.flush()?;
    Ok(())
  })
  .await
}
