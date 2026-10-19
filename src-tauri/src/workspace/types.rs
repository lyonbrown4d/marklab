use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RootInfo {
  pub kind: String,
  pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Entry {
  pub path: String,
  pub name: String,
  pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
  pub root: RootInfo,
  pub entries: Vec<Entry>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmptyRequest {}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PathRequest {
  pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RootRequest {
  pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WriteRequest {
  pub path: String,
  pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BufferStatus {
  pub path: String,
  pub revision: u64,
  pub dirty: bool,
  pub session_generation: u64,
}

#[derive(Debug, Clone)]
pub struct Buffer {
  pub content: String,
  pub baseline: String,
  pub revision: u64,
  pub dirty: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextChange {
  pub offset: usize,
  pub delete_length: usize,
  pub insert_text: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum BufferUpdate {
  Snapshot { content: String },
  Patch { changes: Vec<TextChange> },
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateRequest {
  pub path: String,
  pub base_revision: u64,
  pub session_generation: u64,
  pub update: BufferUpdate,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum UpdateResult {
  Applied {
    path: String,
    revision: u64,
    dirty: bool,
    session_generation: u64,
  },
  ResyncRequired {
    path: String,
    revision: u64,
    session_generation: u64,
  },
  SessionMismatch {
    path: String,
    session_generation: u64,
  },
}
