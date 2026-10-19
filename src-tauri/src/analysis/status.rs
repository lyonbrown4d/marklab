use super::AnalysisService;
use crate::error::{BackendError, BackendResult};
use serde::Deserialize;
use serde_json::{Value, json};

pub struct LogicalStorageStats {
  pub metadata_documents: i64,
  pub searchable_documents: i64,
  pub metadata_bytes: i64,
  pub search_index_bytes: i64,
}

#[derive(Deserialize)]
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
  pub async fn status(&self) -> Value {
    json!({"state":if self.cached_indexes().is_empty(){"stopped"}else{"ready"},"binaryPath":null})
  }
  pub async fn workspaces(&self) -> Vec<Value> {
    let data = self
      .pool
      .connect_options()
      .get_filename()
      .to_string_lossy()
      .into_owned();
    self.cached_indexes().into_iter().map(|index|json!({"workspaceId":index.scope,"indexPath":index.root,"state":"ready","openedAt":index.opened_at,"lastActivityAt":index.indexed_at,"workspaceOpened":true,"identity":{"canonicalRoot":index.root,"engineDataDir":data,"workspaceInstanceId":index.scope},"spawnPlan":{"mode":"rust-embedded"}})).collect()
  }
  pub async fn workspace_status(&self, id: &str) -> BackendResult<Value> {
    let cached = self.cached_indexes();
    let index = cached
      .iter()
      .find(|index| index.scope == id)
      .ok_or_else(|| BackendError::new("STALE_SESSION", "Indexed workspace is unavailable"))?;
    let count = index.files.len().to_string();
    Ok(
      json!({"health":{"ok":true,"state":"ready","metadataDocuments":count,"searchableDocuments":count,"pendingOutboxEvents":"0","warnings":[]},"index":{"searchIndex":"sqlite-fts5","ready":true,"metadataDocuments":count,"searchableDocuments":count,"pendingOutboxEvents":"0","building":false,"updatedAt":index.indexed_at.to_string()}}),
    )
  }
}
