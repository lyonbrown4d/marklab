use super::{
    conflict::{Conflict, Stage},
    preview,
    process::error,
    safety,
};
use crate::error::BackendResult;
use std::{
    io::{Read, Seek, Write},
    path::Path,
};
pub(super) fn write(
    root: &Path,
    expected: &Conflict,
    content: &str,
    deleted: bool,
    stages: &[Stage],
) -> BackendResult<()> {
    let path = safety::worktree_file(root, &expected.path)?;
    let before = match std::fs::symlink_metadata(&path) {
        Ok(v) => Some(v),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    let before_identity = if before.is_some() {
        Some(same_file::Handle::from_path(&path)?)
    } else {
        None
    };
    let stale = || {
        error(
            "git_invalid_input",
            "Conflict result changed outside this editor; refresh before saving",
        )
    };
    if before.is_some() == expected.deleted {
        return Err(stale());
    }
    if deleted {
        if before.is_none() {
            return Ok(());
        }
        if preview::read_worktree(root, &expected.path)?.map_err(|_| stale())? != expected.result {
            return Err(stale());
        }
        safety::worktree_file(root, &expected.path)?;
        let current = same_file::Handle::from_path(&path)?;
        if before_identity.as_ref() != Some(&current) {
            return Err(stale());
        }
        std::fs::remove_file(path)?;
        return Ok(());
    }
    if before.is_none() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        safety::worktree_file(root, &expected.path)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.read(true).write(true);
    if before.is_none() {
        options.create_new(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
        options.mode(
            if stages
                .iter()
                .find(|v| v.stage == 2)
                .or_else(|| stages.iter().find(|v| v.stage == 3))
                .is_some_and(|v| v.mode == "100755")
            {
                0o755
            } else {
                0o644
            },
        );
    }
    let mut handle = options.open(&path)?;
    safety::worktree_file(root, &expected.path)?;
    let opened = handle.metadata()?;
    let opened_identity = same_file::Handle::from_file(handle.try_clone()?)?;
    if !opened.is_file()
        || before_identity
            .as_ref()
            .is_some_and(|v| *v != opened_identity)
    {
        return Err(stale());
    }
    if before.is_some() {
        let mut data = Vec::new();
        Read::by_ref(&mut handle)
            .take((preview::MAX_PREVIEW + 1) as u64)
            .read_to_end(&mut data)?;
        if preview::decode(data).map_err(|_| stale())? != expected.result {
            return Err(stale());
        }
    }
    handle.rewind()?;
    handle.write_all(content.as_bytes())?;
    handle.set_len(content.len() as u64)?;
    Ok(())
}
