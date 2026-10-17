use crate::error::{BackendError, BackendResult};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, PartialEq, Eq)]
struct Identity {
    file: Arc<same_file::Handle>,
    length: u64,
    modified: Option<std::time::SystemTime>,
}

fn identity(path: &Path) -> BackendResult<Option<Identity>> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err(BackendError::new(
                    "INVALID_SAVE_PATH",
                    "Output must be a regular file",
                ));
            }
            Ok(Some(Identity {
                file: Arc::new(same_file::Handle::from_path(path)?),
                length: metadata.len(),
                modified: metadata.modified().ok(),
            }))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

struct Issued {
    path: PathBuf,
    parent_identity: same_file::Handle,
    previous: Option<Identity>,
    issued: Instant,
}

#[derive(Default)]
pub struct SavePathGrants {
    grants: Mutex<HashMap<(String, PathBuf), Issued>>,
}

pub struct SavePathGrant {
    path: PathBuf,
    parent: PathBuf,
    parent_identity: same_file::Handle,
    previous: Option<Identity>,
    committed: bool,
}

impl SavePathGrants {
    pub fn issue(&self, owner: &str, path: &Path) -> BackendResult<()> {
        if !path.is_absolute() {
            return Err(BackendError::new(
                "INVALID_SAVE_PATH",
                "Output path must be absolute",
            ));
        }
        let parent = path
            .parent()
            .ok_or_else(|| BackendError::new("INVALID_SAVE_PATH", "Output parent is unavailable"))?
            .canonicalize()?;
        let path = parent.join(path.file_name().ok_or_else(|| {
            BackendError::new("INVALID_SAVE_PATH", "Output filename is unavailable")
        })?);
        let previous = identity(&path)?;
        let parent_identity = same_file::Handle::from_path(&parent)?;
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| BackendError::new("STATE_ERROR", "Save permissions unavailable"))?;
        grants.retain(|_, grant| grant.issued.elapsed() < Duration::from_secs(300));
        grants.insert(
            (owner.into(), path.clone()),
            Issued {
                path,
                parent_identity,
                previous,
                issued: Instant::now(),
            },
        );
        Ok(())
    }

    pub fn consume(&self, owner: &str, path: &Path) -> BackendResult<SavePathGrant> {
        let parent = path
            .parent()
            .ok_or_else(|| BackendError::new("INVALID_SAVE_PATH", "Output parent is unavailable"))?
            .canonicalize()?;
        let path = parent.join(path.file_name().ok_or_else(|| {
            BackendError::new("INVALID_SAVE_PATH", "Output filename is unavailable")
        })?);
        let issued = self
            .grants
            .lock()
            .map_err(|_| BackendError::new("STATE_ERROR", "Save permissions unavailable"))?
            .remove(&(owner.into(), path))
            .filter(|g| g.issued.elapsed() < Duration::from_secs(300))
            .ok_or_else(|| {
                BackendError::new(
                    "SAVE_PERMISSION_REQUIRED",
                    "Select the export destination in the native save dialog",
                )
            })?;
        Ok(SavePathGrant {
            path: issued.path,
            parent,
            parent_identity: issued.parent_identity,
            previous: issued.previous,
            committed: false,
        })
    }
}

impl SavePathGrant {
    pub fn commit(&mut self, bytes: &[u8]) -> BackendResult<()> {
        if self.committed {
            return Err(BackendError::new(
                "SAVE_PERMISSION_USED",
                "Output permission was already used",
            ));
        }
        if self.parent.canonicalize()? != self.parent
            || same_file::Handle::from_path(&self.parent)? != self.parent_identity
            || identity(&self.path)? != self.previous
        {
            return Err(BackendError::new(
                "SAVE_CONFLICT",
                "Output changed after the save dialog",
            ));
        }
        use std::io::Write;
        let mut temp = tempfile::NamedTempFile::new_in(&self.parent)?;
        temp.write_all(bytes)?;
        if self.previous.is_some() {
            temp.as_file()
                .set_permissions(std::fs::metadata(&self.path)?.permissions())?;
        }
        temp.as_file().sync_all()?;
        temp.persist(&self.path)
            .map_err(|error| BackendError::from(error.error))?;
        self.committed = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn save_permissions_are_owner_scoped_single_use_and_check_external_changes() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("document.pdf");
        let grants = SavePathGrants::default();
        grants.issue("main", &path).unwrap();
        assert!(grants.consume("other", &path).is_err());
        let mut grant = grants.consume("main", &path).unwrap();
        assert!(grants.consume("main", &path).is_err());
        grant.commit(b"pdf-content").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"pdf-content");
        assert!(grant.commit(b"another").is_err());
        grants.issue("main", &path).unwrap();
        let mut grant = grants.consume("main", &path).unwrap();
        std::fs::write(&path, b"external change").unwrap();
        assert!(grant.commit(b"replace").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"external change");
    }

    #[cfg(unix)]
    #[test]
    fn replaced_parent_directory_does_not_inherit_a_save_permission() {
        let root = tempfile::tempdir().unwrap();
        let parent = root.path().join("output");
        std::fs::create_dir(&parent).unwrap();
        let path = parent.join("document.pdf");
        let grants = SavePathGrants::default();
        grants.issue("main", &path).unwrap();
        let mut grant = grants.consume("main", &path).unwrap();
        std::fs::rename(&parent, root.path().join("old-output")).unwrap();
        std::fs::create_dir(&parent).unwrap();
        assert!(grant.commit(b"replace").is_err());
        assert!(!path.exists());
    }
}
