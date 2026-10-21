pub use AnalysisEngineStatus as EngineStatus;
use serde::Serialize;

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisEngineStatus {
  pub state: EngineState,
  pub binary_path: Option<String>,
}
pub use AnalysisEngineState as EngineState;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisEngineState {
  Ready,
  Stopped,
}
pub use AnalysisEmbeddedMode as EmbeddedMode;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisEmbeddedMode {
  pub mode: EngineMode,
}
pub use AnalysisEngineMode as EngineMode;
#[derive(Debug, Serialize, specta::Type)]
pub enum AnalysisEngineMode {
  #[serde(rename = "rust-embedded")]
  RustEmbedded,
}
pub use AnalysisEngineInitialization as EngineInitialization;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisEngineInitialization {
  pub ok: bool,
  pub response: EmbeddedMode,
  pub status: EngineStatus,
}
pub use AnalysisEngineWorkspace as EngineWorkspace;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisEngineWorkspace {
  pub workspace_id: String,
  pub index_path: String,
  pub state: EngineState,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = i64)]
  pub opened_at: i64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = i64)]
  pub last_activity_at: i64,
  pub workspace_opened: bool,
  pub identity: WorkspaceIdentity,
  pub spawn_plan: EmbeddedMode,
}
pub use AnalysisWorkspaceIdentity as WorkspaceIdentity;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisWorkspaceIdentity {
  pub canonical_root: String,
  pub engine_data_dir: String,
  pub workspace_instance_id: String,
}
pub use AnalysisEngineWorkspaceStatus as EngineWorkspaceStatus;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisEngineWorkspaceStatus {
  pub health: WorkspaceHealth,
  pub index: WorkspaceIndexStatus,
}
pub use AnalysisWorkspaceHealth as WorkspaceHealth;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisWorkspaceHealth {
  pub ok: bool,
  pub state: EngineState,
  pub metadata_documents: String,
  pub searchable_documents: String,
  pub pending_outbox_events: String,
  pub warnings: Vec<String>,
}
pub use AnalysisWorkspaceIndexStatus as WorkspaceIndexStatus;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisWorkspaceIndexStatus {
  pub search_index: SearchIndexKind,
  pub ready: bool,
  pub metadata_documents: String,
  pub searchable_documents: String,
  pub pending_outbox_events: String,
  pub building: bool,
  pub updated_at: String,
}
pub use AnalysisSearchIndexKind as SearchIndexKind;
#[derive(Debug, Serialize, specta::Type)]
pub enum AnalysisSearchIndexKind {
  #[serde(rename = "sqlite-fts5")]
  SqliteFts5,
}
pub use AnalysisOccurrenceCancellation as OccurrenceCancellation;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisOccurrenceCancellation {
  pub cancelled: bool,
  pub request_id: String,
}
