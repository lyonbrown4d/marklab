use super::process::error;
use crate::error::BackendResult;
use std::path::{Path, PathBuf};
fn empty(path: &Path) -> BackendResult<Option<std::fs::Metadata>> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_dir()
                || meta.file_type().is_symlink()
                || std::fs::read_dir(path)?.next().is_some()
            {
                return Err(error(
                    "git_invalid_input",
                    "Git clone target must be an empty non-symbolic directory",
                ));
            }
            Ok(Some(meta))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}
pub struct Destination {
    pub staging: PathBuf,
    pub target: PathBuf,
    pub parent: PathBuf,
    requested_parent: PathBuf,
    parent_identity: same_file::Handle,
    target_identity: Option<same_file::Handle>,
    staging_identity: same_file::Handle,
}
impl Destination {
    pub fn prepare(target: PathBuf) -> BackendResult<Self> {
        let requested_parent = target
            .parent()
            .ok_or_else(|| error("git_invalid_input", "Invalid clone target"))?
            .to_owned();
        let basename = target
            .file_name()
            .ok_or_else(|| error("git_invalid_input", "Invalid clone target"))?;
        let parent = std::fs::canonicalize(&requested_parent)?;
        let parent_identity = same_file::Handle::from_path(&parent)?;
        let target = parent.join(basename);
        let target_identity = if empty(&target)?.is_some() {
            Some(same_file::Handle::from_path(&target)?)
        } else {
            None
        };
        let staging = parent.join(format!(
            ".{}.marklab-clone-{}",
            basename.to_string_lossy(),
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&staging)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&staging, std::fs::Permissions::from_mode(0o700))?;
        }
        let staging_identity = same_file::Handle::from_path(&staging)?;
        Ok(Self {
            staging,
            target,
            parent,
            requested_parent,
            parent_identity,
            target_identity,
            staging_identity,
        })
    }
    pub fn publish(&self) -> BackendResult<()> {
        if std::fs::canonicalize(&self.requested_parent)? != self.parent
            || same_file::Handle::from_path(&self.parent)? != self.parent_identity
        {
            return Err(error(
                "git_workspace_boundary",
                "Git clone parent changed during the operation",
            ));
        }
        let current = empty(&self.target)?;
        if self.target_identity.is_some() != current.is_some()
            || self.target_identity.as_ref().is_some_and(|before| {
                same_file::Handle::from_path(&self.target)
                    .map(|after| *before != after)
                    .unwrap_or(true)
            })
        {
            return Err(error(
                "git_workspace_boundary",
                "Git clone target changed during the operation",
            ));
        }
        let staged = std::fs::symlink_metadata(&self.staging)?;
        if staged.file_type().is_symlink()
            || same_file::Handle::from_path(&self.staging)? != self.staging_identity
        {
            return Err(error(
                "git_workspace_boundary",
                "Git clone staging directory changed",
            ));
        }
        if self.target_identity.is_none() {
            std::fs::rename(&self.staging, &self.target)?;
        } else {
            let reservation = self.parent.join(format!(
                ".{}.empty-{}",
                self.target
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy(),
                uuid::Uuid::new_v4()
            ));
            std::fs::rename(&self.target, &reservation)?;
            if let Err(error) = std::fs::rename(&self.staging, &self.target) {
                let _ = std::fs::rename(&reservation, &self.target);
                return Err(error.into());
            }
            std::fs::remove_dir(reservation)?;
        }
        Ok(())
    }
    pub fn cleanup(&self) -> BackendResult<()> {
        if same_file::Handle::from_path(&self.parent).is_ok_and(|v| v == self.parent_identity)
            && std::fs::symlink_metadata(&self.staging).is_ok_and(|v| {
                v.is_dir()
                    && !v.file_type().is_symlink()
                    && same_file::Handle::from_path(&self.staging)
                        .is_ok_and(|v| v == self.staging_identity)
            })
        {
            std::fs::remove_dir_all(&self.staging)?;
        }
        Ok(())
    }
}
