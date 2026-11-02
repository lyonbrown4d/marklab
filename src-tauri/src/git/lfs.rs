//! Native LFS conversion. Repository filter commands are never executed.
use super::process::error;
use crate::error::BackendResult;
use git_lfs_pointer::{Oid, Pointer};
use git_lfs_store::Store;
use sha2::{Digest, Sha256};
use std::{
  fs::File,
  io::{Read, Seek, Write},
  path::{Path, PathBuf},
};

pub(super) fn store(root: &Path) -> BackendResult<Store> {
  // Do not call process::open: filters can run during its initialization.
  let repo = git2::Repository::open_ext(
    root,
    git2::RepositoryOpenFlags::NO_SEARCH,
    std::iter::empty::<&std::ffi::OsStr>(),
  )?;
  let config = repo.config()?;
  if config.get_string("lfs.storage").is_ok() {
    return Err(error(
      "git_lfs_unsupported",
      "Custom LFS storage is not supported",
    ));
  }
  let base = std::fs::canonicalize(repo.commondir())?;
  for suffix in ["lfs", "lfs/objects", "lfs/tmp", "lfs/incomplete"] {
    safe_directory(&base.join(suffix))?;
  }
  Ok(Store::new(base.join("lfs")))
}

fn safe_directory(path: &Path) -> BackendResult<()> {
  match std::fs::symlink_metadata(path) {
    Ok(metadata) if !metadata.is_dir() || metadata.file_type().is_symlink() => Err(error(
      "git_workspace_boundary",
      "LFS storage must use ordinary directories",
    )),
    Ok(_) => Ok(()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(e) => Err(e.into()),
  }
}

pub(super) fn object_path(store: &Store, oid: Oid) -> BackendResult<PathBuf> {
  let path = store.object_path(oid);
  if let Some(parent) = path.parent() {
    if let Some(grandparent) = parent.parent() {
      safe_directory(grandparent)?;
    }
    safe_directory(parent)?;
  }
  match std::fs::symlink_metadata(&path) {
    Ok(metadata) if !metadata.is_file() || metadata.file_type().is_symlink() => {
      return Err(error("git_workspace_boundary", "Unsafe LFS object file"));
    }
    Ok(_) => (),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
    Err(e) => return Err(e.into()),
  }
  Ok(path)
}

pub(super) fn open_object(store: &Store, pointer: &Pointer) -> BackendResult<File> {
  let path = object_path(store, pointer.oid)?;
  let mut options = std::fs::OpenOptions::new();
  options.read(true);
  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    options.custom_flags(libc::O_NOFOLLOW);
  }
  let mut file = options.open(path)?;
  let (oid, size) = digest(&mut file)?;
  if oid != pointer.oid || size != pointer.size {
    return Err(error(
      "git_lfs_object_corrupt",
      "LFS object checksum or size does not match its pointer",
    ));
  }
  file.rewind()?;
  Ok(file)
}

pub(super) fn digest(reader: &mut impl Read) -> BackendResult<(Oid, u64)> {
  let mut hash = Sha256::new();
  let mut size = 0_u64;
  let mut buffer = [0_u8; 64 * 1024];
  loop {
    super::lfs_cancel::check()?;
    let count = reader.read(&mut buffer)?;
    if count == 0 {
      break;
    }
    hash.update(&buffer[..count]);
    size += count as u64;
  }
  let oid = Oid::from_hex(&hex::encode(hash.finalize()))
    .map_err(|_| error("git_lfs_object_corrupt", "Invalid LFS object checksum"))?;
  Ok((oid, size))
}

pub(super) fn pointer(bytes: &[u8]) -> BackendResult<Option<Pointer>> {
  match Pointer::parse(bytes) {
    Ok(pointer) if pointer.extensions.is_empty() => Ok(Some(pointer)),
    Ok(_) => Err(error(
      "git_lfs_unsupported",
      "LFS pointer extensions are not supported",
    )),
    Err(e) if e.is_not_a_pointer() => Ok(None),
    Err(_) => Err(error("git_lfs_pointer_invalid", "Malformed LFS pointer")),
  }
}

pub(super) fn clean(
  root: &Path,
  input: &mut (impl Read + Seek),
  output: &mut impl Write,
) -> BackendResult<()> {
  super::lfs_cancel::check()?;
  let mut prefix = Vec::new();
  Read::by_ref(input).take(1024).read_to_end(&mut prefix)?;
  if prefix.len() < 1024 && pointer(&prefix)?.is_some() {
    output.write_all(&prefix)?;
    return Ok(());
  }
  input.rewind()?;
  let (oid, size) = digest(input)?;
  let store = store(root)?;
  if !object_path(&store, oid)?.is_file() {
    input.rewind()?;
    let (stored_oid, stored_size) = store
      .insert(input)
      .map_err(|_| error("git_lfs_storage_failed", "Could not store LFS content"))?;
    if (stored_oid, stored_size) != (oid, size) {
      return Err(error(
        "git_lfs_object_corrupt",
        "LFS content changed while being stored",
      ));
    }
  }
  // A corrupt pre-existing object must not result in a successful stage.
  let pointer = Pointer::new(oid, size);
  open_object(&store, &pointer)?;
  output.write_all(pointer.encode().as_bytes())?;
  Ok(())
}

pub(super) fn smudge(
  root: &Path,
  input: &mut impl Read,
  output: &mut impl Write,
) -> BackendResult<()> {
  super::lfs_cancel::check()?;
  let mut prefix = Vec::new();
  Read::by_ref(input).take(1024).read_to_end(&mut prefix)?;
  let decoded = if prefix.len() < 1024 {
    pointer(&prefix)?
  } else {
    None
  };
  let Some(pointer) = decoded else {
    output.write_all(&prefix)?;
    std::io::copy(input, output)?;
    return Ok(());
  };
  if pointer.is_empty() {
    return Ok(());
  }
  let store = store(root)?;
  let path = object_path(&store, pointer.oid)?;
  if !path.is_file() {
    super::lfs_network::fetch_missing(root, &pointer)?;
  }
  // Verify before emitting bytes so a failed conversion cannot expose corrupt content.
  let mut file = open_object(&store, &pointer)?;
  super::lfs_cancel::check()?;
  std::io::copy(&mut file, output)?;
  Ok(())
}
