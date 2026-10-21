use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, specta::Type, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Position {
  pub line: usize,
  pub character: usize,
}
#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct Range {
  pub start: Position,
  pub end: Position,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenRequest {
  pub uri: String,
  pub language_id: String,
  #[serde(default)]
  pub path: Option<String>,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub version: u64,
  pub text: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
  pub range: Range,
  #[serde(default)]
  pub range_length: Option<usize>,
  pub text: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct ChangeRequest {
  pub uri: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub version: u64,
  pub changes: Vec<Change>,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct CloseRequest {
  pub uri: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct CompletionRequest {
  pub uri: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub version: u64,
  pub position: Position,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct DiagnosticsRequest {
  pub uri: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub version: u64,
}
#[derive(Serialize, specta::Type)]
pub struct DocumentAck {
  pub ok: bool,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub version: u64,
}
#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarkdownRequest {
  #[serde(default)]
  pub path: Option<String>,
  pub content: String,
  #[serde(default = "first")]
  pub line: usize,
  #[serde(default = "first")]
  pub column: usize,
  #[serde(default)]
  pub new_name: Option<String>,
}
fn first() -> usize {
  1
}

#[derive(Serialize, specta::Type)]
pub struct CloseAck {
  pub ok: bool,
}
