use super::*;
use std::time::Duration;

const MAX_SNAPSHOT_BYTES: u64 = 512 * 1024 * 1024;

pub(super) fn prepare_cache(data: &Path) -> BackendResult<PathBuf> {
  let root = data.canonicalize()?;
  let mut cache = root.clone();
  for component in ["cache", "assets"] {
    cache.push(component);
    match std::fs::symlink_metadata(&cache) {
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
        std::fs::create_dir(&cache)?;
      }
      Err(error) => return Err(error.into()),
      Ok(_) => (),
    }
    let metadata = std::fs::symlink_metadata(&cache)?;
    #[cfg(windows)]
    let linked = {
      use std::os::windows::fs::MetadataExt;
      metadata.file_attributes() & 0x400 != 0 // FILE_ATTRIBUTE_REPARSE_POINT
    };
    #[cfg(not(windows))]
    let linked = metadata.file_type().is_symlink();
    if linked || !metadata.is_dir() || !cache.canonicalize()?.starts_with(&root) {
      return Err(BackendError::new(
        "INVALID_ASSET_CACHE",
        "Preview cache must be a private directory inside application data",
      ));
    }
  }
  Ok(cache)
}

pub(super) fn remove_orphans(cache: &Path) -> BackendResult<()> {
  for entry in std::fs::read_dir(cache)? {
    let entry = entry?;
    // Never follow a link or recurse outside the dedicated asset directory.
    if entry.file_type()?.is_file() {
      remove_temporary(&entry.path());
    }
  }
  Ok(())
}

pub(super) fn expire(grants: &mut HashMap<String, Grant>, now: u64) {
  grants.retain(|_, grant| {
    if grant.expires > now {
      return true;
    }
    if grant.temporary {
      remove_temporary(&grant.path);
    }
    false
  });
}

pub(super) fn check_budget(grants: &HashMap<String, Grant>, additional: u64) -> BackendResult<()> {
  let used = grants
    .values()
    .filter(|grant| grant.temporary)
    .fold(0u64, |used, grant| used.saturating_add(grant.length));
  if used.saturating_add(additional) > MAX_SNAPSHOT_BYTES {
    return Err(BackendError::new(
      "ASSET_LIMIT",
      "Preview snapshots reached the 512 MiB limit; close unused previews and retry",
    ));
  }
  Ok(())
}

pub(super) fn schedule(
  grants: &Arc<Mutex<HashMap<String, Grant>>>,
) -> Option<tokio::task::AbortHandle> {
  let runtime = tokio::runtime::Handle::try_current().ok()?;
  let weak = Arc::downgrade(grants);
  Some(
    runtime
      .spawn(async move {
        loop {
          tokio::time::sleep(Duration::from_secs(60)).await;
          let Some(grants) = weak.upgrade() else { break };
          // Unlinking expired files can block; keep it off the async executor.
          if let Err(error) = crate::blocking::run(move || {
            let mut grants = grants
              .lock()
              .map_err(|_| BackendError::new("STATE_ERROR", "Asset registry is unavailable"))?;
            expire(&mut grants, now_ms());
            Ok(())
          })
          .await
          {
            log::warn!("Preview asset maintenance failed: {}", error.code);
          }
        }
      })
      .abort_handle(),
  )
}

impl Drop for AssetService {
  fn drop(&mut self) {
    if let Some(maintenance) = &self._maintenance {
      maintenance.abort();
    }
  }
}
