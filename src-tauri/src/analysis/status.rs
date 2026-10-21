use super::AnalysisService;
pub use super::status_types::*;
use crate::error::{BackendError, BackendResult};
use serde::Deserialize;

pub struct LogicalStorageStats {
  pub metadata_documents: i64,
  pub searchable_documents: i64,
  pub metadata_bytes: i64,
  pub search_index_bytes: i64,
}

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceStatusRequest {
  pub workspace_id: String,
}

impl AnalysisService {
  // Logical payload sizes for this scope only; never the shared DB file size.
  pub async fn logical_storage_stats(&self, scope: &str) -> BackendResult<LogicalStorageStats> {
    let mut transaction = self.pool.begin().await?;
    let (metadata_documents, document_bytes): (i64, i64) = sqlx::query_as(
      "SELECT count(*),coalesce(sum(bytes),0) FROM analysis_cache_documents WHERE scope=?",
    )
    .bind(scope)
    .fetch_one(&mut *transaction)
    .await?;
    let graph_bytes: i64 =
      sqlx::query_scalar("SELECT coalesce(sum(bytes),0) FROM analysis_cache_graphs WHERE scope=?")
        .bind(scope)
        .fetch_one(&mut *transaction)
        .await?;
    let (searchable_documents, search_index_bytes): (i64, i64) = sqlx::query_as(
            "SELECT count(*),coalesce(sum(length(cast(path AS BLOB))+length(cast(title AS BLOB))+length(cast(content AS BLOB))),0) FROM analysis_fts WHERE scope=?",
        ).bind(scope).fetch_one(&mut *transaction).await?;
    transaction.commit().await?;
    Ok(LogicalStorageStats {
      metadata_documents,
      searchable_documents,
      metadata_bytes: document_bytes + graph_bytes,
      search_index_bytes,
    })
  }
  pub async fn status(&self) -> EngineStatus {
    EngineStatus {
      state: if self.cached_indexes().is_empty() {
        EngineState::Stopped
      } else {
        EngineState::Ready
      },
      binary_path: None,
    }
  }
  pub async fn workspaces(&self) -> Vec<EngineWorkspace> {
    let data = self
      .pool
      .connect_options()
      .get_filename()
      .to_string_lossy()
      .into_owned();
    self
      .cached_indexes()
      .into_iter()
      .map(|index| EngineWorkspace {
        workspace_id: index.scope.clone(),
        index_path: index.root.clone(),
        state: EngineState::Ready,
        opened_at: index.opened_at,
        last_activity_at: index.indexed_at,
        workspace_opened: true,
        identity: WorkspaceIdentity {
          canonical_root: index.root.clone(),
          engine_data_dir: data.clone(),
          workspace_instance_id: index.scope.clone(),
        },
        spawn_plan: EmbeddedMode {
          mode: EngineMode::RustEmbedded,
        },
      })
      .collect()
  }
  pub async fn workspace_status(&self, id: &str) -> BackendResult<EngineWorkspaceStatus> {
    let cached = self.cached_indexes();
    let index = cached
      .iter()
      .find(|index| index.scope == id)
      .ok_or_else(|| BackendError::new("STALE_SESSION", "Indexed workspace is unavailable"))?;
    let count = index.files.len().to_string();
    Ok(EngineWorkspaceStatus {
      health: WorkspaceHealth {
        ok: true,
        state: EngineState::Ready,
        metadata_documents: count.clone(),
        searchable_documents: count.clone(),
        pending_outbox_events: "0".into(),
        warnings: vec![],
      },
      index: WorkspaceIndexStatus {
        search_index: SearchIndexKind::SqliteFts5,
        ready: true,
        metadata_documents: count.clone(),
        searchable_documents: count,
        pending_outbox_events: "0".into(),
        building: false,
        updated_at: index.indexed_at.to_string(),
      },
    })
  }
}
