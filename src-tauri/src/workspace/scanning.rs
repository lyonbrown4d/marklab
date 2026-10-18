use super::{Entry, Snapshot, Workspace};
use crate::error::{BackendError, BackendResult};
use std::path::{Path, PathBuf};

pub fn scan(root: &Path, single: Option<&Path>) -> BackendResult<Vec<Entry>> {
    if let Some(file) = single {
        match std::fs::symlink_metadata(file) {
            Ok(info) if info.is_file() && !info.file_type().is_symlink() => {}
            Ok(_) => {
                return Err(BackendError::new(
                    "INVALID_PATH",
                    "Single-file target is no longer a regular file",
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        }
        return Ok(vec![Entry {
            path: file
                .file_name()
                .ok_or_else(|| BackendError::new("INVALID_PATH", "Document has no filename"))?
                .to_string_lossy()
                .into_owned(),
            name: file
                .file_name()
                .map(|v| v.to_string_lossy().into_owned())
                .unwrap_or_default(),
            kind: "file".into(),
        }]);
    }
    let mut entries = Vec::new();
    for entry in ignore::WalkBuilder::new(root)
        .hidden(false)
        .follow_links(false)
        .filter_entry(|entry| {
            entry.depth() == 0 || !matches!(entry.file_name().to_str(), Some(".git" | ".marklab"))
        })
        .build()
    {
        let entry = entry.map_err(|e| BackendError::new("SCAN_FAILED", e.to_string()))?;
        if entry.depth() == 0 {
            continue;
        }
        let path = entry.path();
        let relative = super::paths::display_relative(root, path)?;
        if relative
            .split('/')
            .any(|p| matches!(p, ".git" | ".marklab"))
        {
            continue;
        }
        let Some(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        entries.push(Entry {
            path: relative,
            name: entry.file_name().to_string_lossy().into_owned(),
            kind: if kind.is_dir() {
                "folder".into()
            } else {
                "file".into()
            },
        });
        if entries.len() >= 100_000 {
            return Err(BackendError::new(
                "WORKSPACE_TOO_LARGE",
                "Workspace exceeds the supported entry limit",
            ));
        }
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

impl Workspace {
    pub async fn snapshot(&self) -> BackendResult<Snapshot> {
        self.ensure_active()?;
        let revision = self.current_revision();
        let root = self.root_info();
        let directory = self.root_directory();
        let single = (root.kind == "single").then(|| PathBuf::from(&root.path));
        let entries = self
            .path_snapshots
            .try_get_with(revision, async move {
                crate::blocking::run(move || scan(&directory, single.as_deref()))
                    .await
                    .map(std::sync::Arc::new)
            })
            .await
            .map_err(|error| (*error).clone())?;
        self.ensure_active()?;
        if revision != self.current_revision() {
            return Err(BackendError::new(
                "STALE_TREE",
                "Workspace changed while scanning paths",
            ));
        }
        Ok(Snapshot {
            root,
            entries: (*entries).clone(),
        })
    }

    pub async fn refresh_buffers_from_disk(&self) -> BackendResult<()> {
        self.refresh_changed_buffers(&[], true).await
    }

    pub(super) async fn refresh_changed_buffers(
        &self,
        changed: &[String],
        all: bool,
    ) -> BackendResult<()> {
        self.ensure_active()?;
        let paths: Vec<_> = self
            .buffers
            .lock()
            .await
            .keys()
            .filter(|path| {
                all || changed
                    .iter()
                    .any(|change| *path == change || path.starts_with(&format!("{change}/")))
            })
            .cloned()
            .collect();
        for path in paths {
            let target = self.resolve_async(&path).await?;
            let buffers = self.buffers.clone();
            let active = self.active.clone();
            let changed = crate::blocking::run(move || {
                let mut buffers = buffers.blocking_lock();
                if !active.load(std::sync::atomic::Ordering::Acquire) {
                    return Ok(false);
                }
                let Some(buffer) = buffers.get_mut(&path) else {
                    return Ok(false);
                };
                if buffer.dirty {
                    return Ok(false);
                }
                match super::buffers::read_disk(&target) {
                    Ok(content) => {
                        if content == buffer.content {
                            return Ok(false);
                        }
                        buffer.revision += 1;
                        buffer.baseline = super::paths::fingerprint(&content);
                        buffer.content = content;
                        Ok(true)
                    }
                    Err(error) if !target.exists() => {
                        let _ = error;
                        buffers.remove(&path);
                        Ok(true)
                    }
                    Err(error) => Err(error),
                }
            })
            .await?;
            if changed {
                self.next_revision();
            }
        }
        Ok(())
    }

    // Caller holds the mutation guard while applying external filesystem changes.
    pub async fn invalidate_external_paths(&self, paths: &[String]) -> BackendResult<()> {
        self.ensure_active()?;
        let mut buffers = self.buffers.lock().await;
        if paths
            .iter()
            .any(|path| buffers.get(path).is_some_and(|buffer| buffer.dirty))
        {
            return Err(BackendError::new(
                "BUFFER_DIRTY",
                "An edited document cannot be replaced by an external operation",
            ));
        }
        for path in paths {
            buffers.remove(path);
        }
        self.next_revision();
        Ok(())
    }
}
