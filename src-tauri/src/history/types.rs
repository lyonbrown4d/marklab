use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub path: String,
    pub created_at: String,
    pub size_bytes: i64,
    pub content_hash: String,
    pub source: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct HistorySnapshot {
    #[serde(flatten)]
    pub entry: HistoryEntry,
    pub content: String,
}
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum CaptureResult {
    Created { entry: HistoryEntry },
    Merged { entry: HistoryEntry },
    Skipped { reason: &'static str },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PathRequest {
    pub path: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntryRequest {
    pub path: String,
    #[serde(alias = "entry_id")]
    pub entry_id: String,
}
#[derive(Serialize)]
pub struct DeleteResult {
    pub ok: bool,
}
#[derive(Serialize)]
pub struct ClearResult {
    pub deleted: u64,
}
