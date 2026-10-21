use super::types::Position;
use lsp_types::{CompletionItem, CompletionList, Diagnostic};
use serde::{Deserialize, Serialize};

// lsp-types owns runtime serialization. These narrow reflection shapes describe
// every protocol field emitted here without requiring a fork of that crate.
#[derive(Serialize, specta::Type)]
#[serde(transparent)]
pub struct CompletionResponse(#[specta(type = CompletionListShape)] pub CompletionList);

#[derive(Serialize, specta::Type)]
#[serde(transparent)]
pub struct DiagnosticsResponse(#[specta(type = Vec<DiagnosticShape>)] pub Vec<Diagnostic>);

#[allow(dead_code)]
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompletionListShape {
  is_incomplete: bool,
  items: Vec<CompletionItemShape>,
}

#[allow(dead_code)]
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompletionItemShape {
  label: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  kind: Option<u32>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  detail: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  documentation: Option<MarkupContentShape>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  sort_text: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  filter_text: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  insert_text: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  insert_text_format: Option<u32>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  text_edit: Option<TextEditShape>,
}

#[allow(dead_code)]
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
struct MarkupContentShape {
  kind: MarkdownKind,
  value: String,
}

#[allow(dead_code)]
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
enum MarkdownKind {
  Markdown,
}

#[allow(dead_code)]
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TextEditShape {
  range: RangeShape,
  new_text: String,
}

#[allow(dead_code)]
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
struct RangeShape {
  start: Position,
  end: Position,
}

#[allow(dead_code)]
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
struct DiagnosticShape {
  range: RangeShape,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  severity: Option<u32>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  source: Option<String>,
  message: String,
}

pub(super) fn completion_list(
  items: Vec<CompletionItem>,
  is_incomplete: bool,
) -> CompletionResponse {
  CompletionResponse(CompletionList {
    is_incomplete,
    items,
  })
}

// Documents and indexed files are bounded to 64 MiB, so their line and UTF-16
// coordinates fit the protocol's u32 integers after existing offset validation.
pub(super) fn position(line: usize, character: usize) -> lsp_types::Position {
  lsp_types::Position::new(line as u32, character as u32)
}

#[cfg(test)]
#[path = "protocol_tests.rs"]
mod tests;
