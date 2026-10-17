use super::{GitState, conflict, history, preview, remote, safety, status, types::*};
use crate::error::{BackendError, BackendResult};
use moka::future::Cache;
use std::{
    future::Future,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
#[path = "cache_value.rs"]
mod values;
pub use values::Value;
#[derive(Clone, Hash, PartialEq, Eq)]
pub enum Query {
    Repository,
    Status,
    FileDiff {
        path: String,
        section: String,
    },
    History {
        limit: Option<u32>,
        skip: Option<u32>,
    },
    Branches,
    Stashes,
    Operation,
    Conflict(String),
    CommitFiles(String),
    CommitDiff {
        commit: String,
        path: String,
        old_path: Option<String>,
    },
    Remote,
}
#[derive(Clone, Hash, PartialEq, Eq)]
struct Key {
    root: PathBuf,
    epoch: u64,
    query: Query,
}
pub struct Queries {
    values: Cache<Key, Arc<Value>>,
    epochs: Mutex<moka::sync::Cache<PathBuf, u64>>,
}
impl Default for Queries {
    fn default() -> Self {
        Self {
            values: Cache::builder()
                .max_capacity(64 * 1024 * 1024)
                .weigher(|key: &Key, value: &Arc<Value>| {
                    value
                        .weight()
                        .saturating_add(key.root.as_os_str().len() as u32 + 128)
                })
                .time_to_live(Duration::from_millis(700))
                .build(),
            epochs: Mutex::new(
                moka::sync::Cache::builder()
                    .max_capacity(256)
                    .time_to_live(Duration::from_secs(10 * 60))
                    .build(),
            ),
        }
    }
}
impl Queries {
    fn epoch(&self, root: &Path) -> BackendResult<u64> {
        // Serialize state allocation with invalidation. An initializer must not
        // publish a root identity after a simultaneous invalidation removed it.
        self.epochs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .try_get_with(root.into(), fresh_epoch)
            .map_err(|error: Arc<BackendError>| (*error).clone())
    }
    pub fn invalidate(&self, root: &Path) {
        self.epochs
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .invalidate(root);
    }
    async fn get(
        &self,
        root: &Path,
        query: Query,
        load: impl Future<Output = BackendResult<Value>>,
    ) -> BackendResult<Arc<Value>> {
        let key = Key {
            root: root.into(),
            epoch: self.epoch(root)?,
            query,
        };
        // An invalidated in-flight initializer may finish, but only in its old
        // epoch. A later query can never observe or join that stale result.
        self.values
            .try_get_with(key, async { load.await.map(Arc::new) })
            .await
            .map_err(|error: Arc<BackendError>| (*error).clone())
    }
}
// Identities are never recycled when root state expires or is evicted while
// a value initializer is still in flight. Exhaustion fails instead of wrapping.
static NEXT_EPOCH: AtomicU64 = AtomicU64::new(1);
fn fresh_epoch() -> BackendResult<u64> {
    let mut current = NEXT_EPOCH.load(Ordering::Acquire);
    loop {
        let next = current.checked_add(1).ok_or_else(|| {
            BackendError::new("git_cache_exhausted", "Git cache identity space exhausted")
        })?;
        match NEXT_EPOCH.compare_exchange_weak(current, next, Ordering::AcqRel, Ordering::Acquire) {
            Ok(_) => return Ok(current),
            Err(observed) => current = observed,
        }
    }
}
pub struct Invalidation<'a> {
    queries: &'a Queries,
    root: PathBuf,
}
impl Drop for Invalidation<'_> {
    fn drop(&mut self) {
        self.queries.invalidate(&self.root);
    }
}
impl GitState {
    pub fn invalidate_root(&self, root: &Path) {
        self.queries.invalidate(&root_key(root));
    }
    pub fn invalidation(&self, root: &Path) -> Invalidation<'_> {
        self.invalidate_root(root);
        Invalidation {
            queries: &self.queries,
            root: root_key(root),
        }
    }
    pub async fn query(&self, root: &Path, query: Query) -> BackendResult<Arc<Value>> {
        let gate = self.lock(root).await;
        let _read = gate.read().await;
        let root = root_key(root);
        self.queries
            .get(&root, query.clone(), load(&root, query))
            .await
    }
}
async fn load(root: &Path, query: Query) -> BackendResult<Value> {
    let missing_allowed = matches!(query, Query::Repository | Query::Status);
    let repository = safety::repository(root, missing_allowed).await?;
    Ok(match query {
        Query::Repository => Value::Repository(if repository {
            status::repo(root).await?
        } else {
            RepoInfo::default()
        }),
        Query::Status => Value::Status(if repository {
            status::status(root).await?
        } else {
            Status::default()
        }),
        Query::FileDiff { path, section } => Value::Diff(
            preview::file_diff(
                root,
                &DiffRequest {
                    expected_root: None,
                    path,
                    section,
                },
            )
            .await?,
        ),
        Query::History { limit, skip } => Value::History(
            history::history(
                root,
                &HistoryRequest {
                    expected_root: None,
                    limit,
                    skip,
                },
            )
            .await?,
        ),
        Query::Branches => Value::Branches(history::branches(root).await?),
        Query::Stashes => Value::Stashes(history::stashes(root).await?),
        Query::Operation => Value::Operation(status::operation(root).await?),
        Query::Conflict(path) => Value::Conflict(conflict::read(root, &path).await?),
        Query::CommitFiles(commit) => {
            Value::CommitFiles(history::commit_files(root, &commit).await?)
        }
        Query::CommitDiff {
            commit,
            path,
            old_path,
        } => Value::Diff(
            preview::commit_diff(
                root,
                &CommitDiffRequest {
                    expected_root: None,
                    commit,
                    path,
                    old_path,
                },
            )
            .await?,
        ),
        Query::Remote => Value::Remote(remote::status(root).await?),
    })
}
#[cfg(test)]
#[path = "cache_tests.rs"]
mod tests;

// WorkspaceRegistry supplies canonical roots; normalize lexical dot aliases too.
pub(super) fn root_key(root: &Path) -> PathBuf {
    root.components().collect()
}
