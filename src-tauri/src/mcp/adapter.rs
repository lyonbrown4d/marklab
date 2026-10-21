use super::{config::Config, types::*};
use crate::{
  analysis::{AnalysisService, Index},
  composition::HeadlessServices,
  database::Database,
  error::{BackendError, BackendResult},
  workspace::{RootInfo, Workspace},
};
use std::sync::{Arc, atomic::AtomicBool};
use tokio::sync::Mutex;

pub(super) struct Adapter {
  pub config: Config,
  pub workspace: Arc<Workspace>,
  pub analysis: AnalysisService,
  pub(super) operation: Mutex<()>,
  database: Database,
}

impl Adapter {
  pub async fn open(config: Config) -> BackendResult<Self> {
    let config = config.canonicalize().await?;
    let services = HeadlessServices::open(config.engine_data_dir.clone())
      .await
      .map_err(|_| {
        BackendError::new(
          "MCP_STORAGE_UNAVAILABLE",
          "Cannot open MCP engine cache; check engine directory permissions",
        )
      })?;
    let workspace = Arc::new(Workspace::new(
      RootInfo {
        kind: crate::workspace::RootKind::External,
        path: config.workspace_root.to_string_lossy().into_owned(),
      },
      1,
    ));
    Ok(Self {
      analysis: services.analysis,
      database: services.database,
      config,
      workspace,
      operation: Mutex::new(()),
    })
  }

  async fn fresh_index(&self) -> BackendResult<Arc<Index>> {
    // This instance has no writers, watchers, autosave, history or GUI binding.
    // Clearing only its clean read cache also observes external deletions.
    {
      let _mutation = self.workspace.mutation.lock().await;
      self.workspace.buffers.lock().await.clear();
      self.workspace.next_revision();
    }
    self.analysis.index(self.workspace.clone()).await
  }

  pub async fn status(&self) -> BackendResult<Status> {
    let _operation = self.operation.lock().await;
    let index = self.fresh_index().await?;
    let stats = self.analysis.logical_storage_stats(&index.scope).await?;
    let metadata = stats.metadata_documents.to_string();
    let searchable = stats.searchable_documents.to_string();
    let ready = stats.searchable_documents as usize == index.files.len()
      && stats.metadata_documents as usize == index.files.len();
    let mut warnings = vec![
      "Storage byte counts are scoped logical payload sizes; SQLite page overhead is excluded."
        .into(),
    ];
    if !ready {
      warnings.push(
        "The persistent cache is incomplete; live workspace search remains available.".into(),
      );
    }
    Ok(Status {
      workspace_root: self.config.workspace_root.to_string_lossy().into_owned(),
      engine_data_dir: self.config.engine_data_dir.to_string_lossy().into_owned(),
      health: Health {
        ok: ready,
        state: if ready { "ready" } else { "degraded" }.into(),
        metadata_documents: metadata.clone(),
        searchable_documents: searchable.clone(),
        pending_outbox_events: "0".into(),
        warnings,
      },
      index: IndexStatus {
        search_index: "sqlite-fts5".into(),
        ready,
        metadata_documents: metadata.clone(),
        searchable_documents: searchable,
        pending_outbox_events: "0".into(),
      },
      storage: Storage {
        metadata_store: "sqlite".into(),
        search_index: "sqlite-fts5".into(),
        metadata_bytes: stats.metadata_bytes.to_string(),
        search_index_bytes: stats.search_index_bytes.to_string(),
        total_bytes: (stats.metadata_bytes + stats.search_index_bytes).to_string(),
        metadata_documents: metadata,
        pending_outbox_events: "0".into(),
        blob_store: false,
        blob_bytes: "0".into(),
      },
    })
  }

  pub async fn search(
    &self,
    input: SearchInput,
    cancelled: Arc<AtomicBool>,
  ) -> BackendResult<SearchOutput> {
    let query = input.query.trim().to_owned();
    let limit = input.limit.unwrap_or(self.config.default_search_limit);
    if query.is_empty() || query.len() > 1024 || !(1..=50).contains(&limit) {
      return Err(BackendError::new(
        "MCP_INVALID_ARGUMENTS",
        "Search requires a non-empty query of at most 1024 bytes and an integer limit from 1 to 50",
      ));
    }
    let _operation = self.operation.lock().await;
    let index = self.fresh_index().await?;
    let result = self
      .analysis
      .counted_search(index, query.clone(), limit, cancelled)
      .await?;
    Ok(SearchOutput {
      query,
      limit,
      total_hits: result.total_hits,
      result_count: result.results.len(),
      results: result.results.into_iter().map(Into::into).collect(),
    })
  }

  pub async fn close(&self) {
    self.database.pool.close().await;
  }
}
