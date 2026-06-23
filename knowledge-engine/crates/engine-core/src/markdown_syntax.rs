#![allow(dead_code)]

use pulldown_cmark::{Options, Parser};
use ropey::Rope;
use serde::Serialize;
use unicode_normalization::UnicodeNormalization;
use unicode_segmentation::UnicodeSegmentation;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownSyntaxSnapshot {
  pub(crate) line_count: usize,
  pub(crate) char_count: usize,
  pub(crate) grapheme_count: usize,
  pub(crate) pulldown_event_count: usize,
  pub(crate) incremental_parser_enabled: bool,
}

pub(crate) fn analyze_markdown_syntax(content: &str) -> MarkdownSyntaxSnapshot {
  let rope = Rope::from_str(content);
  let normalized = content.nfc().collect::<String>();
  let pulldown_event_count = Parser::new_ext(content, gfm_options()).count();

  MarkdownSyntaxSnapshot {
    line_count: rope.len_lines(),
    char_count: rope.len_chars(),
    grapheme_count: UnicodeSegmentation::graphemes(normalized.as_str(), true).count(),
    pulldown_event_count,
    incremental_parser_enabled: cfg!(feature = "tree-sitter-markdown"),
  }
}

fn gfm_options() -> Options {
  Options::ENABLE_TABLES
    | Options::ENABLE_FOOTNOTES
    | Options::ENABLE_STRIKETHROUGH
    | Options::ENABLE_TASKLISTS
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn analyzes_markdown_with_rope_and_parser_stack() {
    let snapshot = analyze_markdown_syntax("# 标题\n\n- [x] item\n");

    assert_eq!(snapshot.line_count, 4);
    assert!(snapshot.char_count > 0);
    assert!(snapshot.grapheme_count > 0);
    assert!(snapshot.pulldown_event_count > 0);
    assert!(!snapshot.incremental_parser_enabled);
  }
}
