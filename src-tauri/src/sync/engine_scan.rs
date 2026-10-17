use super::super::{ManifestEntry, SkippedFile, paths, remote::DavRemote};
use super::{
    files,
    manifest::{self, MAX_FILE, failure},
};
use crate::error::BackendResult;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};
use tokio::sync::watch;
pub struct Scan {
    pub entries: Vec<ManifestEntry>,
    pub skipped: Vec<SkippedFile>,
}
pub async fn local(
    root: &Path,
    device: &str,
    cancel: &watch::Receiver<bool>,
) -> BackendResult<Scan> {
    let root = root.to_owned();
    let device = device.to_owned();
    let cancel = cancel.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut pending = vec![root.clone()];
        let mut entries = Vec::new();
        let mut skipped = Vec::new();
        let mut portable = BTreeSet::new();
        while let Some(directory) = pending.pop() {
            files::cancelled(&cancel)?;
            let meta = std::fs::symlink_metadata(&directory)?;
            if meta.file_type().is_symlink() || !meta.is_dir() {
                return Err(failure("Sync directory changed while scanning"));
            }
            for entry in std::fs::read_dir(&directory)? {
                files::cancelled(&cancel)?;
                let entry = entry?;
                let name = entry
                    .file_name()
                    .into_string()
                    .map_err(|_| failure("Sync paths must be UTF-8"))?;
                if [".git", ".marklab-sync", "node_modules", ".cache"]
                    .contains(&name.to_ascii_lowercase().as_str())
                {
                    continue;
                }
                let path = entry.path();
                let kind = entry.file_type()?;
                if kind.is_symlink() {
                    continue;
                }
                if kind.is_dir() {
                    pending.push(path);
                    continue;
                }
                if !kind.is_file() {
                    continue;
                }
                let lower = name.to_ascii_lowercase();
                if [".tmp", ".temp", ".swp", ".part", "~"]
                    .iter()
                    .any(|suffix| lower.ends_with(suffix))
                {
                    continue;
                }
                let raw = path
                    .strip_prefix(&root)
                    .map_err(|_| failure("Sync path escaped workspace"))?
                    .to_str()
                    .ok_or_else(|| failure("Sync paths must be UTF-8"))?
                    .replace('\\', "/");
                let relative = paths::sync_path(&raw)?;
                if !portable.insert(manifest::portable(&relative)) {
                    return Err(failure("Local sync paths conflict on portable filesystems"));
                }
                let metadata = std::fs::symlink_metadata(files::target(&root, &relative)?)?;
                if metadata.len() > MAX_FILE {
                    skipped.push(SkippedFile {
                        path: relative,
                        reason: "file_too_large".into(),
                        size: metadata.len(),
                    });
                    continue;
                }
                let fingerprint = files::fingerprint(&root, &relative, Some(&cancel))?
                    .ok_or_else(|| failure("Sync file disappeared while scanning"))?;
                entries.push(ManifestEntry {
                    path: relative,
                    hash: fingerprint.hash,
                    size: fingerprint.size,
                    modified_at: chrono::DateTime::<chrono::Utc>::from(fingerprint.modified)
                        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                    device_id: device.clone(),
                    storage: None,
                    etag: None,
                    deleted_at: None,
                });
                if entries.len() + skipped.len() > 1_000_000 {
                    return Err(failure("Workspace exceeds sync file limit"));
                }
            }
        }
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(Scan { entries, skipped })
    })
    .await
    .map_err(|e| failure(&e.to_string()))?
}
pub async fn bootstrap(
    remote: &DavRemote,
    cancel: &mut watch::Receiver<bool>,
) -> BackendResult<Scan> {
    let mut pending = vec![String::new()];
    let mut seen = BTreeMap::new();
    let mut entries = Vec::new();
    while let Some(directory) = pending.pop() {
        let children = match files::retry(cancel, || remote.list(&directory)).await {
            Ok(value) => value,
            Err(error) if directory.is_empty() && error.code == "WEBDAV_NOT_FOUND" => {
                return Ok(Scan {
                    entries: Vec::new(),
                    skipped: Vec::new(),
                });
            }
            Err(error) => return Err(error),
        };
        for item in children {
            if item
                .path
                .split('/')
                .any(|part| part.eq_ignore_ascii_case(".marklab-sync"))
            {
                return Err(failure(
                    "Remote sync metadata exists but its manifest is missing",
                ));
            }
            let path = paths::sync_path(&item.path)?;
            let key = manifest::portable(&path);
            if seen.insert(key, path.clone()).is_some() {
                return Err(failure("Conflicting portable remote paths"));
            }
            if item.directory {
                pending.push(path);
                continue;
            }
            if item.size > MAX_FILE {
                return Err(failure(
                    "Cannot initialize sync from an incomplete remote scan",
                ));
            }
            let temporary = files::temporary(None).await?;
            files::interrupt(cancel, remote.download(&path, temporary.path(), MAX_FILE)).await?;
            let hash = files::inspect(
                temporary
                    .path()
                    .parent()
                    .ok_or_else(|| failure("Invalid temporary path"))?,
                temporary
                    .path()
                    .file_name()
                    .and_then(|v| v.to_str())
                    .ok_or_else(|| failure("Invalid temporary path"))?,
                cancel,
            )
            .await?
            .ok_or_else(|| failure("Downloaded bootstrap file disappeared"))?;
            if hash.size != item.size {
                return Err(failure("Remote file changed while initializing sync"));
            }
            entries.push(ManifestEntry {
                path,
                hash: hash.hash,
                size: hash.size,
                modified_at: item.modified_at,
                device_id: "remote-bootstrap".into(),
                storage: None,
                etag: item.etag,
                deleted_at: None,
            });
            if entries.len() > 1_000_000 {
                return Err(failure("Remote exceeds sync file limit"));
            }
        }
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Scan {
        entries,
        skipped: Vec::new(),
    })
}
