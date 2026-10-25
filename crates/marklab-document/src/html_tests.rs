use crate::{ExportFormat, PublicationOptions, SourceDocument, render};
use std::collections::BTreeMap;
use tokio_util::sync::CancellationToken;

fn source(markdown: &str) -> SourceDocument {
  SourceDocument {
    path: "chapter.md".into(),
    title: "Chapter".into(),
    markdown: markdown.into(),
    assets: BTreeMap::new(),
  }
}

fn html(documents: &[SourceDocument]) -> String {
  let options = PublicationOptions::document(ExportFormat::Html, "Publication".into());
  String::from_utf8(
    render(
      ExportFormat::Html,
      documents,
      &options,
      &CancellationToken::new(),
    )
    .expect("HTML render"),
  )
  .expect("HTML UTF-8")
}

#[test]
fn single_document_html_links_match_unicode_and_collision_safe_heading_ids() {
  let output = html(&[source(
    "# Repeat\n\n## Repeat\n\n## Repeat-1\n\n## 中文 标题\n\n[duplicate](#repeat-1) [unicode](#%E4%B8%AD%E6%96%87%20%E6%A0%87%E9%A2%98) [sibling](other.html#target) [unsafe](javascript:alert)",
  )]);
  for id in ["repeat", "repeat-1", "repeat-1-1", "中文-标题"] {
    assert_eq!(output.matches(&format!("id=\"{id}\"")).count(), 1);
  }
  assert!(output.contains("href=\"#repeat-1\""));
  assert!(output.contains("href=\"#中文-标题\""));
  assert!(output.contains("href=\"other.html#target\""));
  assert!(!output.contains("href=\"javascript:"));
}

#[test]
fn merged_html_scopes_local_headings_and_preserves_cross_chapter_targets() {
  let markdown =
    "# Shared\n\n[local](#shared) [other](#chapter-1-heading-shared) [root](#chapter-1)";
  let output = html(&[source(markdown), source(markdown)]);
  for chapter in 0..2 {
    let id = format!("chapter-{chapter}-heading-shared");
    assert_eq!(output.matches(&format!("id=\"{id}\"")).count(), 1);
    assert!(output.contains(&format!("href=\"#{id}\"")));
  }
  assert!(output.contains("href=\"#chapter-1\""));
  assert!(!output.contains("href=\"#chapter-0-heading-chapter-1"));
}
