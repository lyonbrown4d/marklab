use super::patches::MAX_DOCUMENT_BYTES;
use super::paths::fingerprint;
use super::types::{Buffer, UpdateRequest, UpdateResult};
use super::{BufferStatus, Workspace};
use crate::error::{BackendError, BackendResult};

impl Workspace {
    pub async fn read_file(&self, path: &str) -> BackendResult<String> {
        let target = self.resolve_async(path).await?;
        let buffers = self.buffers.clone();
        let key = path.to_owned();
        let content = crate::blocking::run(move || {
            if let Some(buffer) = buffers.blocking_lock().get(&key) {
                return Ok(buffer.content.clone());
            }
            read_disk(&target)
        })
        .await?;
        self.ensure_active()?;
        Ok(content)
    }

    // Installing a read is serialized with updates so a delayed disk read can
    // never overwrite an edit or reinsert a buffer after a move/root transition.
    pub async fn open_file(&self, path: &str) -> BackendResult<String> {
        let _mutation = self.mutation.lock().await;
        self.open_file_under_lock(path).await
    }

    pub async fn open_file_under_lock(&self, path: &str) -> BackendResult<String> {
        let target = self.resolve_async(path).await?;
        let key = path.to_owned();
        let buffers = self.buffers.clone();
        let active = self.active.clone();
        let (content, changed) = crate::blocking::run(move || {
            let mut buffers = buffers.blocking_lock();
            if !active.load(std::sync::atomic::Ordering::Acquire) {
                return Err(stale());
            }
            if let Some(buffer) = buffers.get_mut(&key) {
                if buffer.dirty {
                    return Ok((buffer.content.clone(), false));
                }
                // Explicit opens must observe disk changes even when notify's
                // debounced event has not reached the workspace yet.
                let content = read_disk(&target)?;
                let changed = content != buffer.content;
                if changed {
                    buffer.baseline = fingerprint(&content);
                    buffer.content = content;
                    buffer.revision += 1;
                }
                return Ok((buffer.content.clone(), changed));
            }
            let content = read_disk(&target)?;
            let baseline = fingerprint(&content);
            if !active.load(std::sync::atomic::Ordering::Acquire) {
                return Err(stale());
            }
            buffers.insert(
                key,
                Buffer {
                    content: content.clone(),
                    baseline,
                    revision: 0,
                    dirty: false,
                },
            );
            Ok((content, false))
        })
        .await?;
        if changed {
            self.next_revision();
        }
        Ok(content)
    }

    pub async fn buffer_status(&self, path: &str) -> BackendResult<Option<BufferStatus>> {
        self.ensure_active()?;
        super::paths::relative_path(path)?;
        Ok(self.buffers.lock().await.get(path).map(|b| BufferStatus {
            path: path.into(),
            revision: b.revision,
            dirty: b.dirty,
            session_generation: self.generation,
        }))
    }

    pub async fn write_file(&self, path: &str, content: &str) -> BackendResult<()> {
        let _mutation = self.mutation.lock().await;
        self.write_file_under_lock(path, content).await
    }

    pub async fn write_file_under_lock(&self, path: &str, content: &str) -> BackendResult<()> {
        if content.len() > MAX_DOCUMENT_BYTES {
            return Err(BackendError::new(
                "FILE_TOO_LARGE",
                "Document exceeds text editor limit",
            ));
        }
        self.open_file_under_lock(path).await?;
        let buffers = self.buffers.clone();
        let key = path.to_owned();
        let content = content.to_owned();
        let active = self.active.clone();
        crate::blocking::run(move || {
            let mut buffers = buffers.blocking_lock();
            if !active.load(std::sync::atomic::Ordering::Acquire) {
                return Err(stale());
            }
            let buffer = buffers.get_mut(&key).ok_or_else(stale)?;
            buffer.dirty = fingerprint(&content) != buffer.baseline;
            buffer.content = content;
            buffer.revision += 1;
            Ok(())
        })
        .await?;
        self.next_revision();
        Ok(())
    }

    pub async fn apply_update(&self, request: UpdateRequest) -> BackendResult<UpdateResult> {
        let _mutation = self.mutation.lock().await;
        self.apply_update_under_lock(request).await
    }

    pub async fn apply_update_under_lock(
        &self,
        request: UpdateRequest,
    ) -> BackendResult<UpdateResult> {
        self.ensure_active()?;
        if request.session_generation != self.generation {
            return Ok(UpdateResult::SessionMismatch {
                path: request.path,
                session_generation: self.generation,
            });
        }
        self.open_file_under_lock(&request.path).await?;
        let buffers = self.buffers.clone();
        let active = self.active.clone();
        let generation = self.generation;
        let result = crate::blocking::run(move || {
            let mut buffers = buffers.blocking_lock();
            if !active.load(std::sync::atomic::Ordering::Acquire) {
                return Err(stale());
            }
            let buffer = buffers.get_mut(&request.path).ok_or_else(stale)?;
            if request.base_revision != buffer.revision {
                return Ok(UpdateResult::ResyncRequired {
                    path: request.path,
                    revision: buffer.revision,
                    session_generation: generation,
                });
            }
            let next = super::patches::apply(&buffer.content, request.update)?;
            buffer.dirty = fingerprint(&next) != buffer.baseline;
            buffer.content = next;
            buffer.revision += 1;
            Ok(UpdateResult::Applied {
                path: request.path,
                revision: buffer.revision,
                dirty: buffer.dirty,
                session_generation: generation,
            })
        })
        .await?;
        if matches!(result, UpdateResult::Applied { .. }) {
            self.next_revision();
        }
        Ok(result)
    }
}

pub(super) fn read_disk(path: &std::path::Path) -> BackendResult<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(BackendError::new(
            "INVALID_PATH",
            "Document must be a regular file",
        ));
    }
    let mut content = String::new();
    (&mut file)
        .take((MAX_DOCUMENT_BYTES + 1) as u64)
        .read_to_string(&mut content)?;
    if content.len() > MAX_DOCUMENT_BYTES {
        return Err(BackendError::new(
            "FILE_TOO_LARGE",
            "Document exceeds text editor limit",
        ));
    }
    Ok(content)
}
fn stale() -> BackendError {
    BackendError::new("STALE_SESSION", "Workspace has changed")
}
