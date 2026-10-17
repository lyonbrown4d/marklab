use super::{
    AnalysisService, Index, document,
    service::{DocumentKey, IndexKey, changed},
    targets,
};
use crate::{
    error::{BackendError, BackendResult},
    workspace::Workspace,
};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, atomic::Ordering},
};
impl AnalysisService {
    pub(super) async fn build_index(
        &self,
        workspace: Arc<Workspace>,
        key: IndexKey,
    ) -> BackendResult<Arc<Index>> {
        let _build = self.build.lock().await;
        if workspace.current_revision() != key.revision
            || self.epoch.load(Ordering::Acquire) != key.epoch
        {
            return Err(changed());
        }
        self.indexing.store(key.generation, Ordering::Release);
        let _indexing = Indexing(&self.indexing);
        let disk_ready = match self.ensure_schema().await {
            Ok(()) => true,
            Err(error) => {
                log::warn!("Analysis disk cache unavailable: {}", error.code);
                false
            }
        };
        let snapshot = workspace.snapshot().await?;
        let scope = crate::database::workspace_key(&snapshot.root.kind, &snapshot.root.path)?;
        let scope = format!("analysis-v1:{:x}", Sha256::digest(scope.as_bytes()));
        let paths: BTreeSet<_> = snapshot
            .entries
            .iter()
            .filter(|entry| entry.kind == "file")
            .map(|entry| entry.path.clone())
            .collect();
        let mut raw = BTreeMap::new();
        let mut hashes = BTreeMap::new();
        let mut total = 0usize;
        for path in paths.iter().filter(|path| is_markdown(path)) {
            // Verify content, including dirty authoritative buffers, before AST
            // reuse. Same-size/mtime edits cannot resurrect stale disk metadata.
            let content = workspace.read_file(path).await?;
            total = total.saturating_add(content.len());
            if total > 128 * 1024 * 1024 {
                return Err(BackendError::new(
                    "INDEX_TOO_LARGE",
                    "Workspace Markdown exceeds the 128 MiB indexing limit",
                ));
            }
            let path = path.clone();
            let hash_path = path.clone();
            let (content, hash) = tokio::task::spawn_blocking(move || {
                let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
                (content, hash)
            })
            .await
            .map_err(|error| BackendError::new("INDEX_FAILED", error.to_string()))?;
            let document_key = DocumentKey {
                scope: scope.clone(),
                path: path.clone(),
                hash: hash.clone(),
            };
            let document = self
                .documents
                .try_get_with(document_key, async {
                    if disk_ready
                        && let Some(document) = self.disk_document(&scope, &path, &hash).await
                    {
                        return Ok(document);
                    }
                    tokio::task::spawn_blocking(move || document::parse(hash_path, content))
                        .await
                        .map_err(|error| BackendError::new("INDEX_FAILED", error.to_string()))?
                        .map(Arc::new)
                })
                .await
                .map_err(|error| (*error).clone())?;
            hashes.insert(path.clone(), hash);
            raw.insert(path, document);
        }
        let mut hasher = Sha256::new();
        for (path, hash) in &hashes {
            hasher.update((path.len() as u64).to_le_bytes());
            hasher.update(path.as_bytes());
            hasher.update(hash.as_bytes());
        }
        // Path-only changes invalidate link resolution even if every source hash matches.
        for path in &paths {
            hasher.update((path.len() as u64).to_le_bytes());
            hasher.update(path.as_bytes());
        }
        let fingerprint = format!("{:x}", hasher.finalize());
        let mut files = raw.clone();
        let resolve_paths = paths.clone();
        let files = tokio::task::spawn_blocking(move || {
            targets::resolve_documents(&mut files, &resolve_paths);
            files
        })
        .await
        .map_err(|error| BackendError::new("INDEX_FAILED", error.to_string()))?;
        let _mutation = workspace.mutation.lock().await;
        workspace.ensure_active()?;
        if workspace.current_revision() != key.revision
            || self.epoch.load(Ordering::Acquire) != key.epoch
        {
            return Err(changed());
        }
        let now = chrono::Utc::now().timestamp_millis();
        let opened_at = self
            .cached
            .iter()
            .find(|(cached, _)| cached.generation == key.generation)
            .map_or(now, |(_, index)| index.opened_at);
        let index = Arc::new(Index {
            revision: key.revision,
            generation: key.generation,
            epoch: key.epoch,
            scope,
            root: snapshot.root.path,
            opened_at,
            indexed_at: now,
            files,
            paths,
            fingerprint,
        });
        if disk_ready && let Err(error) = self.persist_index(&index, &raw, &hashes).await {
            log::warn!("Analysis disk cache write skipped: {}", error.code);
        }
        if self.epoch.load(Ordering::Acquire) != key.epoch {
            return Err(changed());
        }
        Ok(index)
    }
}
fn is_markdown(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}
struct Indexing<'a>(&'a std::sync::atomic::AtomicU64);
impl Drop for Indexing<'_> {
    fn drop(&mut self) {
        self.0.store(0, Ordering::Release);
    }
}
