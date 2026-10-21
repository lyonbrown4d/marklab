use super::RootInfo;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
  pub(super) kind: crate::workspace::EntryKind,
  pub(super) name: String,
  pub(super) path: String,
  pub(super) has_children: bool,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct ChildrenRequest {
  #[serde(default)]
  pub(super) cursor: Option<String>,
  #[serde(default)]
  pub(super) limit: Option<usize>,
  #[serde(default)]
  pub(super) parent: Option<String>,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ChildrenResult {
  pub(super) entries: Vec<TreeEntry>,
  pub(super) next_cursor: Option<String>,
  pub(super) parent: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) generation: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) revision: u64,
  pub(super) root: RootInfo,
}
#[derive(Serialize, specta::Type)]
pub struct InitialResult {
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) generation: u64,
  pub(super) path: Option<String>,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) revision: u64,
  pub(super) root: RootInfo,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct ExistenceRequest {
  #[serde(default)]
  pub(super) kind: Option<String>,
  pub(super) paths: Vec<String>,
}
#[derive(Serialize, specta::Type)]
pub struct ExistenceResult {
  pub(super) existing: Vec<String>,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) generation: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) revision: u64,
  pub(super) root: RootInfo,
}
pub use WorkspaceSearchRequest as SearchRequest;
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceSearchRequest {
  pub(super) query: String,
  #[serde(default)]
  pub(super) limit: Option<usize>,
}
pub use WorkspaceSearchResult as SearchResult;
#[derive(Serialize, specta::Type)]
pub struct WorkspaceSearchResult {
  pub(super) entries: Vec<TreeEntry>,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) generation: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub(super) revision: u64,
  pub(super) root: RootInfo,
}
