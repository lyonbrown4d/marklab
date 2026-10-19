use super::document::Document;
use crate::{
  error::{BackendError, BackendResult},
  workspace::Workspace,
};
use moka::future::Cache;
use sqlx::SqlitePool;
use std::{
  collections::{BTreeMap, BTreeSet, HashMap},
  sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
  },
  time::Duration,
};
use tokio::sync::{Mutex, OnceCell, Semaphore};
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) struct IndexKey {
  pub generation: u64,
  pub revision: u64,
  pub epoch: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) struct DocumentKey {
  pub scope: String,
  pub path: String,
  pub hash: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) struct QueryKey {
  pub generation: u64,
  pub revision: u64,
  pub epoch: u64,
  pub query: String,
}
#[derive(Clone)]
pub struct Index {
  pub revision: u64,
  pub generation: u64,
  pub scope: String,
  pub root: String,
  pub opened_at: i64,
  pub indexed_at: i64,
  pub files: BTreeMap<String, Arc<Document>>,
  pub paths: BTreeSet<String>,
  pub(super) epoch: u64,
  pub(super) fingerprint: String,
}
pub struct AnalysisService {
  pub(super) pool: SqlitePool,
  pub(super) excluded_directory: Option<std::path::PathBuf>,
  pub(super) cached: Cache<IndexKey, Arc<Index>>,
  pub(super) documents: Cache<DocumentKey, Arc<Document>>,
  pub(super) queries: Cache<QueryKey, Arc<serde_json::Value>>,
  pub(super) schema: OnceCell<()>,
  pub(super) build: Mutex<()>,
  pub(super) epoch: AtomicU64,
  pub(super) indexing: AtomicU64,
  pub(super) searches: Mutex<HashMap<(String, String), Arc<std::sync::atomic::AtomicBool>>>,
  pub(super) workers: Arc<Semaphore>,
}
impl AnalysisService {
  pub fn new(pool: SqlitePool) -> Self {
    Self {
      pool,
      excluded_directory: None,
      cached: Cache::builder()
        .name("analysis-indexes")
        .max_capacity(64 * 1024 * 1024)
        .weigher(|_: &IndexKey, index: &Arc<Index>| {
          super::cache::index_weight(index).max(4 * 1024 * 1024)
        })
        .time_to_live(Duration::from_secs(15 * 60))
        .build(),
      documents: Cache::builder()
        .name("analysis-parsed-documents")
        .max_capacity(32 * 1024 * 1024)
        .weigher(|_: &DocumentKey, document: &Arc<Document>| {
          super::cache::document_weight(document).max(4096)
        })
        .time_to_live(Duration::from_secs(15 * 60))
        .build(),
      queries: Cache::builder()
        .name("analysis-projections")
        .max_capacity(32 * 1024 * 1024)
        .weigher(|_: &QueryKey, value: &Arc<serde_json::Value>| {
          super::cache::value_weight(value).max(1024 * 1024)
        })
        .time_to_live(Duration::from_secs(5 * 60))
        .build(),
      schema: OnceCell::new(),
      build: Mutex::new(()),
      epoch: AtomicU64::new(1),
      indexing: AtomicU64::new(0),
      searches: Mutex::new(HashMap::new()),
      workers: Arc::new(Semaphore::new(2)),
    }
  }
  pub fn with_excluded_directory(pool: SqlitePool, directory: std::path::PathBuf) -> Self {
    let mut service = Self::new(pool);
    service.excluded_directory = Some(directory);
    service
  }
  pub fn is_indexing(&self, generation: u64) -> bool {
    self.indexing.load(Ordering::Acquire) == generation
  }
  pub async fn index(&self, workspace: Arc<Workspace>) -> BackendResult<Arc<Index>> {
    workspace.ensure_active()?;
    let key = IndexKey {
      generation: workspace.generation,
      revision: workspace.current_revision(),
      epoch: self.epoch.load(Ordering::Acquire),
    };
    let result = self
      .cached
      .try_get_with(
        key.clone(),
        self.build_index(workspace.clone(), key.clone()),
      )
      .await
      .map_err(|error| (*error).clone())?;
    if self.epoch.load(Ordering::Acquire) != key.epoch
      || workspace.current_revision() != key.revision
    {
      return Err(changed());
    }
    workspace.ensure_active()?;
    Ok(result)
  }
  pub(super) fn cached_indexes(&self) -> Vec<Arc<Index>> {
    let epoch = self.epoch.load(Ordering::Acquire);
    let mut indexes = BTreeMap::<String, Arc<Index>>::new();
    for (key, index) in self.cached.iter() {
      if key.epoch == epoch
        && indexes
          .get(&index.scope)
          .is_none_or(|previous| previous.indexed_at <= index.indexed_at)
      {
        indexes.insert(index.scope.clone(), index);
      }
    }
    indexes.into_values().collect()
  }
  pub async fn invalidate(&self, _generation: u64) {
    self.epoch.fetch_add(1, Ordering::AcqRel);
    self.cached.invalidate_all();
    self.queries.invalidate_all();
  }
  pub async fn stop(&self) -> BackendResult<()> {
    self.epoch.fetch_add(1, Ordering::AcqRel);
    let _build = self.build.lock().await;
    self.cached.invalidate_all();
    self.queries.invalidate_all();
    self.documents.invalidate_all();
    self.cached.run_pending_tasks().await;
    self.queries.run_pending_tasks().await;
    self.documents.run_pending_tasks().await;
    Ok(())
  }
}
pub(super) fn changed() -> BackendError {
  BackendError::new(
    "INDEX_CHANGED",
    "Workspace changed while indexing; retry the query",
  )
}
