use super::*;
use crate::types::ExportFormat;
use std::collections::BTreeMap;

#[test]
fn semantic_text_preserves_structure_links_notes_and_code() {
  let document = SourceDocument {
    path: "notes.md".into(), title: "Chapter".into(), assets: BTreeMap::new(),
    markdown: "# Chapter\n\nFirst **bold** paragraph.\n\nSecond [site](https://example.test).[^n]\n\n3. third\n4. fourth\n   - nested\n\n| A | B |\n| - | - |\n| one | two |\n\n```rust\nlet value = 42;\n  indented();\n```\n\n![Chart](chart.png)\n\n$x^2$\n\n[^n]: A note.".into(),
  };
  let options = PublicationOptions::document(ExportFormat::Txt, "Book".into());
  let bytes = render(&[document], &options, &CancellationToken::new()).expect("TXT export");
  let text = String::from_utf8(bytes).expect("UTF-8");
  assert_eq!(text.matches("Chapter").count(), 1);
  assert!(text.contains("First bold paragraph.\n\nSecond site (https://example.test).[n]"));
  assert!(text.contains("3. third\n4. fourth"));
  assert!(text.contains("  • nested"));
  assert!(text.contains("A\tB\none\ttwo\n"));
  assert!(text.contains("let value = 42;\n  indented();"));
  assert!(text.contains("[Image: Chart]"));
  assert!(text.contains("x^2"));
  assert!(text.contains("[n] A note."));
}

#[test]
fn chapters_contents_and_cancellation_are_respected() {
  let documents = ["One", "Two"].map(|title| SourceDocument {
    path: format!("{title}.md"),
    title: title.into(),
    markdown: "Body".into(),
    assets: BTreeMap::new(),
  });
  let mut options = PublicationOptions::document(ExportFormat::Txt, "Book".into());
  options.cover = true;
  options.table_of_contents = true;
  let token = CancellationToken::new();
  let text = String::from_utf8(render(&documents, &options, &token).expect("TXT")).expect("UTF-8");
  assert!(text.starts_with("Book\n\nContents\n1. One\n2. Two\n\nOne\n\nBody\n\nTwo\n\nBody"));
  token.cancel();
  assert_eq!(
    render(&documents, &options, &token)
      .expect_err("cancelled")
      .code,
    "EXPORT_CANCELLED"
  );
}
