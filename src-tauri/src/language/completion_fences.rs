use super::{Position, item};
use lsp_types::{CompletionItem, CompletionItemKind};

const LANGUAGES: &[&str] = &[
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "mermaid",
  "rust",
  "shell",
  "sql",
  "toml",
  "tsx",
  "typescript",
  "yaml",
];
pub(super) fn completions(before: &str, position: Position) -> Option<Vec<CompletionItem>> {
  let fence = before.rfind("```")?;
  if fence > 0 && !before[..fence].chars().next_back()?.is_whitespace() {
    return None;
  }
  let query = before[fence + 3..].to_ascii_lowercase();
  if !query
    .bytes()
    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'+' | b'-'))
  {
    return None;
  }
  Some(
    LANGUAGES
      .iter()
      .filter(|language| {
        language.contains(&query)
          || match **language {
            "bash" | "shell" => query == "sh",
            "javascript" => query == "js",
            "markdown" => query == "md",
            "mermaid" => query == "mmd",
            "typescript" => query == "ts",
            "yaml" => query == "yml",
            _ => false,
          }
      })
      .map(|language| {
        item(
          language,
          language,
          "Code fence language",
          CompletionItemKind::KEYWORD,
          position,
          before[..fence + 3].encode_utf16().count(),
        )
      })
      .collect(),
  )
}
