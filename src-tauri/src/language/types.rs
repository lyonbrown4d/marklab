use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Position {
  pub line: usize,
  pub character: usize,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Range {
  pub start: Position,
  pub end: Position,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenRequest {
  pub uri: String,
  pub language_id: String,
  pub path: Option<String>,
  pub version: u64,
  pub text: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
  pub range: Range,
  pub range_length: Option<usize>,
  pub text: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangeRequest {
  pub uri: String,
  pub version: u64,
  pub changes: Vec<Change>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloseRequest {
  pub uri: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompletionRequest {
  pub uri: String,
  pub version: u64,
  pub position: Position,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiagnosticsRequest {
  pub uri: String,
  pub version: u64,
}
#[derive(Serialize)]
pub struct DocumentAck {
  pub ok: bool,
  pub version: u64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarkdownRequest {
  pub path: Option<String>,
  pub content: String,
  #[serde(default = "first")]
  pub line: usize,
  #[serde(default = "first")]
  pub column: usize,
  pub new_name: Option<String>,
}
fn first() -> usize {
  1
}
