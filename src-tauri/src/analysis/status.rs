use super::AnalysisService;
use crate::error::{BackendError, BackendResult};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceStatusRequest {
    pub workspace_id: String,
}

impl AnalysisService {
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
            .ok_or_else(|| {
                BackendError::new("STALE_SESSION", "Indexed workspace is unavailable")
            })?;
        let count = index.files.len().to_string();
        Ok(
            json!({"health":{"ok":true,"state":"ready","metadataDocuments":count,"searchableDocuments":count,"pendingOutboxEvents":"0","warnings":[]},"index":{"searchIndex":"sqlite-fts5","ready":true,"metadataDocuments":count,"searchableDocuments":count,"pendingOutboxEvents":"0","building":false,"updatedAt":index.indexed_at.to_string()}}),
        )
    }
}
