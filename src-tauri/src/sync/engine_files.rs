use super::super::paths;
use super::manifest::failure;
use crate::error::{BackendError, BackendResult};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tokio::sync::watch;
pub fn cancelled(cancel: &watch::Receiver<bool>) -> BackendResult<()> {
    if *cancel.borrow() {
        Err(BackendError::new(
            "SYNC_CANCELLED",
            "Workspace sync was cancelled",
        ))
    } else {
        Ok(())
    }
}
pub async fn interrupt<T>(
    cancel: &mut watch::Receiver<bool>,
    future: impl std::future::Future<Output = BackendResult<T>>,
) -> BackendResult<T> {
    cancelled(cancel)?;
    let cancellation = async {
        loop {
            if cancel.changed().await.is_err() || *cancel.borrow() {
                break;
            }
        }
    };
    tokio::select! {result=future=>result,_=cancellation=>Err(BackendError::new("SYNC_CANCELLED","Workspace sync was cancelled"))}
}
pub fn target(root: &Path, relative: &str) -> BackendResult<PathBuf> {
    let relative = paths::sync_path(relative)?;
    let mut current = root.to_path_buf();
    let parts: Vec<_> = relative.split('/').collect();
    for (index, part) in parts.iter().enumerate() {
        current.push(part);
        match std::fs::symlink_metadata(&current) {
            Ok(meta) => {
                if meta.file_type().is_symlink()
                    || (if index + 1 < parts.len() {
                        !meta.is_dir()
                    } else {
                        !meta.is_file()
                    })
                {
                    return Err(failure(
                        "Sync paths must contain regular files and directories without symlinks",
                    ));
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                for tail in &parts[index + 1..] {
                    current.push(tail);
                }
                break;
            }
            Err(e) => return Err(e.into()),
        }
    }
    Ok(current)
}
#[derive(Clone)]
pub struct Fingerprint {
    pub hash: String,
    pub size: u64,
    pub modified: std::time::SystemTime,
}
pub fn fingerprint(
    root: &Path,
    path: &str,
    cancel: Option<&watch::Receiver<bool>>,
) -> BackendResult<Option<Fingerprint>> {
    let target = target(root, path)?;
    let before = match std::fs::symlink_metadata(&target) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options.open(&target)?;
    let opened = same_file::Handle::from_file(file.try_clone()?)?;
    if opened != same_file::Handle::from_path(&target)? {
        return Err(failure("Sync file changed while opening"));
    }
    let mut hash = Sha256::new();
    let mut size = 0;
    let mut buffer = [0u8; 65536];
    loop {
        if let Some(cancel) = cancel {
            cancelled(cancel)?;
        }
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        size += count as u64;
        hash.update(&buffer[..count]);
    }
    target_check(root, path)?;
    let after = std::fs::symlink_metadata(&target)?;
    if opened != same_file::Handle::from_path(&target)?
        || before.len() != after.len()
        || before.modified()? != after.modified()?
        || size != after.len()
    {
        return Err(failure("Sync file changed while reading"));
    }
    Ok(Some(Fingerprint {
        hash: format!("{:x}", hash.finalize()),
        size,
        modified: after.modified()?,
    }))
}
pub fn target_check(root: &Path, path: &str) -> BackendResult<()> {
    target(root, path).map(|_| ())
}
pub async fn inspect(
    root: &Path,
    path: &str,
    cancel: &watch::Receiver<bool>,
) -> BackendResult<Option<Fingerprint>> {
    let root = root.to_path_buf();
    let path = path.to_owned();
    let cancel = cancel.clone();
    tauri::async_runtime::spawn_blocking(move || fingerprint(&root, &path, Some(&cancel)))
        .await
        .map_err(|e| failure(&e.to_string()))?
}
pub async fn assert_hash(
    root: &Path,
    path: &str,
    expected: Option<&str>,
    cancel: &watch::Receiver<bool>,
) -> BackendResult<()> {
    let current = inspect(root, path, cancel).await?;
    if current.as_ref().map(|v| v.hash.as_str()) != expected {
        return Err(BackendError::new(
            "SYNC_LOCAL_CHANGED",
            format!("Local file changed while preparing sync: {path}"),
        ));
    }
    Ok(())
}
pub async fn snapshot(
    root: &Path,
    path: &str,
    expected: &str,
    size: u64,
    cancel: &watch::Receiver<bool>,
) -> BackendResult<tempfile::NamedTempFile> {
    let root = root.to_owned();
    let path = path.to_owned();
    let expected = expected.to_owned();
    let cancel = cancel.clone();
    tauri::async_runtime::spawn_blocking(move || {
        cancelled(&cancel)?;
        let source = target(&root, &path)?;
        let file = tempfile::NamedTempFile::new()?;
        let mut input = std::fs::File::open(&source)?;
        let mut output = file.reopen()?;
        let mut hash = Sha256::new();
        let mut copied = 0u64;
        let mut buffer = [0u8; 65536];
        loop {
            cancelled(&cancel)?;
            let count = input.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            copied += count as u64;
            if copied > size {
                return Err(failure("Local upload changed after scanning"));
            }
            hash.update(&buffer[..count]);
            output.write_all(&buffer[..count])?;
        }
        target_check(&root, &path)?;
        if copied != size || format!("{:x}", hash.finalize()) != expected {
            return Err(failure("Local upload changed after scanning"));
        }
        Ok(file)
    })
    .await
    .map_err(|e| failure(&e.to_string()))?
}
pub async fn retry<T, F, Fut>(cancel: &mut watch::Receiver<bool>, mut work: F) -> BackendResult<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = BackendResult<T>>,
{
    for attempt in 0..3 {
        match interrupt(cancel, work()).await {
            Err(error)
                if attempt < 2
                    && ["WEBDAV_NETWORK", "WEBDAV_REMOTE_ERROR"].contains(&error.code.as_str()) =>
            {
                let delay = std::time::Duration::from_millis(150 * (1 << attempt));
                interrupt(cancel, async {
                    tokio::time::sleep(delay).await;
                    Ok(())
                })
                .await?;
            }
            result => return result,
        }
    }
    Err(failure("Remote retry limit exceeded"))
}

pub async fn resolve(root: &Path, path: &str) -> BackendResult<PathBuf> {
    let root = root.to_owned();
    let path = path.to_owned();
    tauri::async_runtime::spawn_blocking(move || target(&root, &path))
        .await
        .map_err(|e| failure(&e.to_string()))?
}
pub async fn temporary(parent: Option<&Path>) -> BackendResult<tempfile::NamedTempFile> {
    let parent = parent.map(Path::to_owned);
    tauri::async_runtime::spawn_blocking(move || {
        match parent {
            Some(parent) => tempfile::NamedTempFile::new_in(parent),
            None => tempfile::NamedTempFile::new(),
        }
        .map_err(BackendError::from)
    })
    .await
    .map_err(|e| failure(&e.to_string()))?
}
#[path = "engine_publish.rs"]
mod publishing;
pub use publishing::{Publication, publish, verify_download};
