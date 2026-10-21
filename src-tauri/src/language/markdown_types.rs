use serde::Serialize;

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSymbol {
  pub name: String,
  pub level: u8,
  pub line: usize,
  pub column: usize,
  pub end_column: usize,
  pub lsp_kind: u8,
  pub children: Vec<MarkdownSymbol>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDefinition {
  pub path: String,
  pub line: usize,
  pub column: usize,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub end_column: Option<usize>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub heading_slug: Option<String>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownReference {
  pub path: String,
  pub line: usize,
  pub column: usize,
  pub end_column: usize,
  pub text: String,
  pub context: String,
  pub target_anchor: Option<String>,
  pub target_heading_slug: Option<String>,
}

#[derive(Serialize, specta::Type)]
pub struct MarkdownHover {
  pub path: String,
  pub line: usize,
  pub heading: Option<String>,
  pub markdown: String,
}

#[derive(Serialize, specta::Type)]
#[serde(tag = "kind")]
pub enum MarkdownCodeAction {
  #[serde(rename = "create-file", rename_all = "camelCase")]
  CreateFile {
    title: String,
    path: String,
    is_preferred: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
  },
  #[serde(rename = "replace-text", rename_all = "camelCase")]
  ReplaceText {
    title: String,
    is_preferred: bool,
    edit: MarkdownTextEdit,
  },
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownTextEdit {
  pub path: Option<String>,
  pub line: usize,
  pub start_column: usize,
  pub end_column: usize,
  pub new_text: String,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
  pub edits: Vec<super::rename::Edit>,
  pub applied_edits: usize,
  pub touched_files: Vec<String>,
  pub reject_reason: Option<String>,
}
