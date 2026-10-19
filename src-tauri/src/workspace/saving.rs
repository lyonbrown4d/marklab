use super::{Workspace, paths::fingerprint};
use crate::error::{BackendError, BackendResult};
use std::io::Write;
use std::path::Path;

impl Workspace {
  pub async fn flush_buffers(&self) -> BackendResult<u32> {
    let _mutation = self.mutation.lock().await;
    self.flush_buffers_under_lock().await
  }

  // The mutation guard spans the disk commit and baseline publication.
  pub async fn flush_buffers_under_lock(&self) -> BackendResult<u32> {
    self.ensure_active()?;
    self
      .saving
      .store(true, std::sync::atomic::Ordering::Release);
    let _running = Saving(&self.saving);
    let result = self.save_dirty().await;
    if let Ok(mut error) = self.save_error.lock() {
      *error = result.as_ref().err().map(|error| error.message.clone());
    }
    result
  }

  async fn save_dirty(&self) -> BackendResult<u32> {
    let _commits = self.commit_gate.lock().await;
    let paths: Vec<_> = self
      .buffers
      .lock()
      .await
      .iter()
      .filter(|(_, buffer)| buffer.dirty)
      .map(|(path, _)| path.clone())
      .collect();
    let mut saved = 0;
    for path in paths {
      let target = self.resolve_async(&path).await?;
      let buffers = self.buffers.clone();
      let active = self.active.clone();
      let root = self.root_directory();
      let key = path.clone();
      let capture_history = self.history.is_some();
      let content = crate::blocking::run(move || {
        let mut buffers = buffers.blocking_lock();
        let Some(buffer) = buffers.get_mut(&key).filter(|buffer| buffer.dirty) else {
          return Ok(None);
        };
        if !active.load(std::sync::atomic::Ordering::Acquire) {
          return Err(BackendError::new(
            "STALE_SESSION",
            "Workspace changed before save",
          ));
        }
        let hash = fingerprint(&buffer.content);
        atomic_save(&root, &target, &buffer.content, &buffer.baseline, &hash)?;
        buffer.baseline = hash;
        buffer.dirty = false;
        Ok(Some(
          (capture_history && buffer.content.len() <= 256 * 1024).then(|| buffer.content.clone()),
        ))
      })
      .await?;
      if let Some(content) = content {
        self.next_revision();
        saved += 1;
        if let (Some(history), Some(content)) = (&self.history, content)
          && let Err(error) = history
            .capture(&self.root_info(), &path, &content, "save")
            .await
        {
          log::warn!(
            "Document saved but local history capture failed: {}",
            error.code
          );
        }
      }
    }
    Ok(saved)
  }
}

// Keep the original identity as well as its content fingerprint: replacement
// with identical bytes still invalidates the checked save target.
#[derive(PartialEq, Eq)]
struct Identity {
  length: u64,
  modified: Option<std::time::SystemTime>,
  #[cfg(unix)]
  device: u64,
  #[cfg(unix)]
  inode: u64,
}
fn identity(path: &Path) -> BackendResult<Identity> {
  let metadata = std::fs::symlink_metadata(path)?;
  if !metadata.is_file() || metadata.file_type().is_symlink() {
    return Err(BackendError::new(
      "FILE_CONFLICT",
      "Save target is no longer a regular file",
    ));
  }
  #[cfg(unix)]
  use std::os::unix::fs::MetadataExt;
  Ok(Identity {
    length: metadata.len(),
    modified: metadata.modified().ok(),
    #[cfg(unix)]
    device: metadata.dev(),
    #[cfg(unix)]
    inode: metadata.ino(),
  })
}
fn conflict() -> BackendError {
  BackendError::new(
    "FILE_CONFLICT",
    "Document changed on disk; reload before saving",
  )
}

pub(super) fn atomic_save(
  root: &Path,
  target: &Path,
  content: &str,
  baseline: &str,
  content_hash: &str,
) -> BackendResult<()> {
  let parent = target
    .parent()
    .ok_or_else(|| BackendError::new("INVALID_PATH", "Document has no parent directory"))?;
  let canonical_parent = parent.canonicalize()?;
  if root.canonicalize()? != root || !canonical_parent.starts_with(root) {
    return Err(conflict());
  }
  let before = identity(target)?;
  let disk = super::buffers::read_disk(target)?;
  let disk_hash = fingerprint(&disk);
  if disk_hash != baseline && disk_hash != content_hash {
    return Err(conflict());
  }
  let mut temporary = tempfile::NamedTempFile::new_in(&canonical_parent)?;
  temporary
    .as_file_mut()
    .set_permissions(std::fs::metadata(target)?.permissions())?;
  temporary.write_all(content.as_bytes())?;
  temporary.as_file_mut().sync_all()?;
  // Recheck after staging, immediately before atomic replacement. There is no
  // portable conditional-rename primitive against uncooperative disk writers.
  if parent.canonicalize()? != canonical_parent
    || identity(target)? != before
    || fingerprint(&super::buffers::read_disk(target)?) != disk_hash
  {
    return Err(conflict());
  }
  temporary
    .persist(target)
    .map_err(|error| BackendError::from(error.error))?;
  #[cfg(unix)]
  std::fs::File::open(&canonical_parent)?.sync_all()?;
  Ok(())
}

struct Saving<'a>(&'a std::sync::atomic::AtomicBool);
impl Drop for Saving<'_> {
  fn drop(&mut self) {
    self.0.store(false, std::sync::atomic::Ordering::Release);
  }
}
