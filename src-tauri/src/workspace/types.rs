use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum RootKind {
  Internal,
  External,
  Single,
}
impl RootKind {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Internal => "internal",
      Self::External => "external",
      Self::Single => "single",
    }
  }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
  File,
  Folder,
}
impl EntryKind {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::File => "file",
      Self::Folder => "folder",
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct RootInfo {
  pub kind: RootKind,
  pub path: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Entry {
  pub path: String,
  pub name: String,
  pub kind: EntryKind,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Snapshot {
  pub root: RootInfo,
  pub entries: Vec<Entry>,
}
pub use WorkspaceEmptyRequest as EmptyRequest;

#[derive(Debug, Default, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceEmptyRequest {}
pub use WorkspacePathRequest as PathRequest;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspacePathRequest {
  pub path: String,
}
pub use WorkspaceRootRequest as RootRequest;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceRootRequest {
  #[serde(default)]
  pub path: Option<String>,
}
pub use WorkspaceWriteRequest as WriteRequest;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceWriteRequest {
  pub path: String,
  pub content: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct BufferStatus {
  pub path: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub revision: u64,
  pub dirty: bool,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub session_generation: u64,
}

#[derive(Debug, Clone)]
pub struct Buffer {
  pub content: String,
  pub baseline: String,
  pub revision: u64,
  pub dirty: bool,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct TextChange {
  pub offset: usize,
  pub delete_length: usize,
  pub insert_text: String,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum BufferUpdate {
  Snapshot { content: String },
  Patch { changes: Vec<TextChange> },
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct UpdateRequest {
  pub path: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub base_revision: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub session_generation: u64,
  pub update: BufferUpdate,
}
pub use WorkspaceUpdateResult as UpdateResult;

#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WorkspaceUpdateResult {
  Applied {
    path: String,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    revision: u64,
    dirty: bool,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    session_generation: u64,
  },
  ResyncRequired {
    path: String,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    revision: u64,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    session_generation: u64,
  },
  SessionMismatch {
    path: String,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    session_generation: u64,
  },
}
