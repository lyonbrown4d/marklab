use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct HistoryEntry {
  pub id: String,
  pub path: String,
  pub created_at: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = i64)]
  pub size_bytes: i64,
  pub content_hash: String,
  pub source: String,
}
#[derive(Clone, Debug, Serialize, specta::Type)]
pub struct HistorySnapshot {
  #[serde(flatten)]
  pub entry: HistoryEntry,
  pub content: String,
}
#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum CaptureResult {
  Created { entry: HistoryEntry },
  Merged { entry: HistoryEntry },
  Skipped { reason: &'static str },
}
pub use HistoryPathRequest as PathRequest;
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct HistoryPathRequest {
  pub path: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntryRequest {
  pub path: String,
  #[serde(alias = "entry_id")]
  pub entry_id: String,
}
#[derive(Serialize, specta::Type)]
pub struct DeleteResult {
  pub ok: bool,
}
#[derive(Serialize, specta::Type)]
pub struct ClearResult {
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub deleted: u64,
}
