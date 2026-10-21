use super::domain::*;
use crate::ai::secrets::SecretUpdate;
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
  pub id: String,
  pub label: String,
  pub endpoint: String,
  pub base_path: String,
  pub username: String,
  pub allow_insecure_local: bool,
  pub session_only: bool,
  pub has_password: bool,
  pub created_at: String,
  pub updated_at: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileInput {
  pub id: String,
  pub label: String,
  pub endpoint: String,
  #[serde(default)]
  pub base_path: Option<String>,
  pub username: String,
  #[serde(default)]
  pub allow_insecure_local: bool,
  #[serde(default)]
  pub session_only: bool,
  #[serde(default)]
  pub password: SecretUpdate,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncChannel {
  pub provider: SyncProvider,
  pub profile_id: String,
  pub remote_root: String,
  pub auto_sync: bool,
}
pub type Channel = SyncChannel;
#[derive(Serialize, specta::Type)]
pub struct Channels {
  pub webdav: Option<Channel>,
}
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManifestEntry {
  pub path: String,
  pub hash: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub size: u64,
  pub modified_at: String,
  pub device_id: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub storage: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub etag: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub deleted_at: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
  pub version: u32,
  pub device_id: String,
  pub updated_at: String,
  pub entries: Vec<ManifestEntry>,
}
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncConflict {
  pub path: String,
  pub status: ConflictStatus,
  pub reason: ConflictReason,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub conflict_path: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub local_hash: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub remote_hash: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncState {
  pub version: u32,
  #[serde(default)]
  pub remote_manifest_etag: Option<String>,
  pub baseline: Vec<ManifestEntry>,
  #[serde(default)]
  pub unresolved_conflicts: Vec<SyncConflict>,
  pub updated_at: String,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
  pub path: String,
  pub reason: SkipReason,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub size: u64,
}
#[derive(Default, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
  pub changed_paths: Vec<String>,
  pub conflicts: Vec<SyncConflict>,
  pub skipped: Vec<SkippedFile>,
  pub uploaded: u32,
  pub downloaded: u32,
  pub deleted: u32,
  pub retries: u32,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct SyncProgress {
  pub stage: SyncStage,
  pub completed: usize,
  pub total: usize,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Binding {
  pub profile_id: String,
  pub remote_root: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConflictRequest {
  pub root_path: String,
  pub path: String,
  pub binding: Binding,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolutionRequest {
  pub root_path: String,
  pub path: String,
  pub binding: Binding,
  pub choice: ConflictChoice,
  #[serde(default)]
  pub expected_local_hash: Option<String>,
  #[serde(default)]
  pub expected_remote_hash: Option<String>,
  pub confirm_delete: bool,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConflictVersion {
  pub hash: Option<String>,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub size: u64,
  pub text: Option<String>,
  pub unavailable: Option<ConflictUnavailable>,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConflictComparison {
  pub conflict: SyncConflict,
  pub local: ConflictVersion,
  pub saved_remote: ConflictVersion,
}
#[derive(Serialize, specta::Type)]
pub struct ConflictList {
  pub conflicts: Vec<SyncConflict>,
  pub binding: Option<Binding>,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ResolutionResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub backup_path: Option<String>,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestId {
  pub request_id: String,
}
pub use SyncRootRequest as RootRequest;
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyncRootRequest {
  pub root_path: String,
}
pub use SyncIdRequest as IdRequest;
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct SyncIdRequest {
  pub id: String,
}
pub use SyncEmptyRequest as EmptyRequest;
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct SyncEmptyRequest {}
pub use SyncOkResult as OkResult;
#[derive(Serialize, specta::Type)]
pub struct SyncOkResult {
  pub ok: bool,
}
#[derive(Serialize, specta::Type)]
pub struct CancelResult {
  pub ok: bool,
  pub cancelled: bool,
}
#[derive(Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum SyncOutcome {
  Completed { result: SyncResult },
  Cancelled,
  Busy,
  Failed { message: String },
}
