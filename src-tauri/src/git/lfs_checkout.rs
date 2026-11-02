//! Verify/fetch target objects before libgit2 opens checkout destinations.
//! A filter alone is too late: libgit2 truncates a destination before smudging.
use super::{lfs, process::error, safety};
use crate::error::BackendResult;
use git_lfs_pointer::Pointer;
use std::{io::Seek, path::Path};

fn recover_worktree(root: &Path, path: &str, pointer: &Pointer) -> BackendResult<bool> {
  let path = safety::worktree_file(root, path)?;
  let mut options = std::fs::OpenOptions::new();
  options.read(true);
  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    options.custom_flags(libc::O_NOFOLLOW);
  }
  let mut file = match options.open(path) {
    Ok(file) => file,
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
    Err(e) => return Err(e.into()),
  };
  if !file.metadata()?.is_file() || file.metadata()?.len() != pointer.size {
    return Ok(false);
  }
  let (oid, size) = lfs::digest(&mut file)?;
  if (oid, size) != (pointer.oid, pointer.size) {
    return Ok(false);
  }
  file.rewind()?;
  let store = lfs::store(root)?;
  lfs::object_path(&store, oid)?;
  store.insert_verified(oid, &mut file).map_err(|_| {
    error(
      "git_lfs_storage_failed",
      "Could not recover verified LFS content from the working tree",
    )
  })?;
  Ok(true)
}

fn file(repo: &git2::Repository, path: &str, oid: git2::Oid) -> BackendResult<()> {
  super::lfs_cancel::check()?;
  let (size, kind) = repo.odb()?.read_header(oid)?;
  if kind != git2::ObjectType::Blob || size == 0 || size >= git_lfs_pointer::MAX_POINTER_SIZE {
    return Ok(());
  }
  let blob = repo.find_blob(oid)?;
  let Some(pointer) = lfs::pointer(blob.content())? else {
    return Ok(());
  };
  if pointer.is_empty() {
    return Ok(());
  }
  let root = repo.workdir().ok_or_else(|| {
    error(
      "git_workspace_boundary",
      "LFS checkout requires a working tree",
    )
  })?;
  let store = lfs::store(root)?;
  if !lfs::object_path(&store, pointer.oid)?.is_file() && !recover_worktree(root, path, &pointer)? {
    super::lfs_network::fetch_missing(root, &pointer)?;
  }
  lfs::open_object(&store, &pointer)?;
  Ok(())
}

pub(super) fn tree(repo: &git2::Repository, tree: &git2::Tree<'_>) -> BackendResult<()> {
  let mut pending = vec![(tree.id(), String::new())];
  while let Some((oid, prefix)) = pending.pop() {
    super::lfs_cancel::check()?;
    let tree = repo.find_tree(oid)?;
    for entry in tree.iter() {
      let path = format!("{prefix}{}", entry.name()?);
      match entry.filemode() {
        0o040000 => pending.push((entry.id(), format!("{path}/"))),
        0o100644 | 0o100755 => file(repo, &path, entry.id())?,
        _ => (),
      }
    }
  }
  Ok(())
}

pub(super) fn index(repo: &git2::Repository, index: &git2::Index) -> BackendResult<()> {
  for entry in index.iter() {
    if [0o100644, 0o100755].contains(&entry.mode) {
      let path = std::str::from_utf8(&entry.path)
        .map_err(|_| error("git_invalid_input", "Git paths must use UTF-8"))?;
      file(repo, path, entry.id)?;
    }
  }
  Ok(())
}

pub(super) fn commit(repo: &git2::Repository, oid: git2::Oid) -> BackendResult<()> {
  tree(repo, &repo.find_commit(oid)?.tree()?)
}
