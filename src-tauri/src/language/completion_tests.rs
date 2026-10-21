use super::*;
use crate::{
  analysis::AnalysisService,
  language::{LanguageService, types::OpenRequest},
  workspace::{RootInfo, Workspace},
};
use serde_json::{Value, json};
use std::sync::Arc;

pub(super) async fn fixture() -> (tempfile::TempDir, Arc<Index>) {
  let directory = tempfile::tempdir().expect("workspace");
  let paths = [
    "notes/current.md",
    "notes/guide.md",
    "notes/target.md",
    "docs/guide.md",
    "notes/calendar.ics",
    "assets/logo.png",
    "docs/specification.pdf",
    "docs/blueprint.drawio",
    "docs/project.excalidraw",
    "docs/report.docx",
    "docs/slides.pptx",
    "docs/table.xlsx",
    "media/audio.mp3",
    "media/video.mp4",
    "secret.key",
  ];
  for path in paths {
    let target = directory.path().join(path);
    tokio::fs::create_dir_all(target.parent().expect("parent"))
      .await
      .expect("directory");
    let content = if path == "notes/target.md" {
      "# Target\n\n## Installation Guide\n\n## Other"
    } else {
      "# Deliberately different heading\n"
    };
    tokio::fs::write(target, content).await.expect("file");
  }
  let workspace = Arc::new(Workspace::new(
    RootInfo {
      kind: crate::workspace::RootKind::External,
      path: directory
        .path()
        .canonicalize()
        .expect("canonical root")
        .to_string_lossy()
        .into_owned(),
    },
    1,
  ));
  let pool = sqlx::sqlite::SqlitePoolOptions::new()
    .max_connections(1)
    .connect("sqlite::memory:")
    .await
    .expect("SQLite");
  let service = AnalysisService::new(pool);
  (
    directory,
    service
      .index(workspace)
      .await
      .expect("native workspace index"),
  )
}
pub(super) async fn complete(index: &Index, text: &str, uri: &str) -> Value {
  let service = LanguageService::default();
  service
    .open(
      "window".into(),
      OpenRequest {
        uri: uri.into(),
        language_id: "markdown".into(),
        path: Some("notes/current.md".into()),
        version: 1,
        text: text.into(),
      },
    )
    .await
    .expect("document");
  let document = service
    .snapshot("window".into(), uri.into(), 1)
    .await
    .expect("snapshot");
  let position = Position {
    line: text.bytes().filter(|byte| *byte == b'\n').count(),
    character: text
      .rsplit('\n')
      .next()
      .unwrap_or("")
      .encode_utf16()
      .count(),
  };
  let index = crate::language::markdown::overlay(
    index,
    &crate::language::types::MarkdownRequest {
      path: document.path.clone(),
      content: text.into(),
      line: position.line + 1,
      column: position.character + 1,
      new_name: None,
    },
  )
  .expect("unsaved overlay");
  serde_json::to_value(completion(&index, &document, position).expect("completion"))
    .expect("wire completion")
}

#[tokio::test]
async fn slash_snippets_preserve_source_only_trigger_keywords_order_and_replacement_range() {
  let (_directory, index) = fixture().await;
  let all = complete(&index, "/", "file:///notes/current.md").await;
  assert_eq!(all["isIncomplete"], false);
  assert_eq!(
    all["items"]
      .as_array()
      .expect("snippets")
      .iter()
      .map(|item| item["label"].as_str().expect("label"))
      .collect::<Vec<_>>(),
    [
      "Heading",
      "Link",
      "Image",
      "Code fence",
      "Table",
      "Task list",
      "Blockquote",
      "Horizontal rule",
      "Unordered list",
      "Ordered list"
    ]
  );
  let filtered = complete(&index, "# Header\n \t/LI", "file:///notes/current.md").await;
  let items = filtered["items"].as_array().expect("filtered snippets");
  assert_eq!(
    items
      .iter()
      .map(|item| item["label"].as_str().expect("label"))
      .collect::<Vec<_>>(),
    ["Link", "Task list", "Unordered list", "Ordered list"]
  );
  assert_eq!(items[0]["insertTextFormat"], 2);
  assert_eq!(items[0]["filterText"], "Link url");
  assert_eq!(items[0]["sortText"], "9000");
  assert_eq!(
    items[0]["textEdit"],
    json!({"newText":"[${1:text}](${2:path})","range":{"start":{"line":1,"character":2},"end":{"line":1,"character":5}}})
  );
  let keyword = complete(&index, "/todo", "file:///notes/current.md").await;
  assert_eq!(keyword["items"][0]["label"], "Task list");
  for (text, uri) in [
    ("", "file:///note.md"),
    ("text /lin", "file:///note.md"),
    ("/lin", "MARKLAB-EMBEDDED://fragment"),
  ] {
    assert_eq!(complete(&index, text, uri).await["items"], json!([]));
  }
}

#[tokio::test]
async fn link_files_include_previewable_paths_and_keep_wiki_scope_fuzzy_order_and_cap() {
  let (_directory, index) = fixture().await;
  let result = complete(&index, "[Open](", "file:///notes/current.md").await;
  let items = result["items"].as_array().expect("files");
  assert_eq!(items.len(), 14);
  let calendar = items
    .iter()
    .find(|item| item["detail"] == "notes/calendar.ics")
    .expect("calendar");
  assert_eq!(calendar["label"], "calendar");
  assert_eq!(calendar["insertText"], "calendar.ics");
  let image = items
    .iter()
    .find(|item| item["detail"] == "assets/logo.png")
    .expect("image path");
  assert_eq!(image["insertText"], "../assets/logo.png");
  assert!(!items.iter().any(|item| item["detail"] == "secret.key"));
  let fuzzy = complete(&index, "😀 [Spec](spc", "file:///notes/current.md").await;
  let specification = fuzzy["items"]
    .as_array()
    .expect("fuzzy files")
    .iter()
    .find(|item| item["detail"] == "docs/specification.pdf")
    .expect("fuzzy PDF");
  assert_eq!(specification["label"], "specification.pdf");
  assert_eq!(
    specification["documentation"],
    json!({"kind":"markdown","value":"**specification.pdf**\n\n`docs/specification.pdf`"})
  );
  assert_eq!(
    specification["textEdit"],
    json!({"newText":"../docs/specification.pdf","range":{"start":{"line":0,"character":10},"end":{"line":0,"character":13}}})
  );
  let guides = complete(&index, "[Guide](gui", "file:///notes/current.md").await;
  assert_eq!(guides["items"][0]["detail"], "notes/guide.md");
  assert_eq!(guides["items"][1]["detail"], "docs/guide.md");
  assert_eq!(guides["items"][0]["sortText"], "0007-guide-notes/guide.md");
  let wiki = complete(&index, "[[", "file:///notes/current.md").await;
  assert_eq!(
    wiki["items"].as_array().expect("Markdown-only wiki").len(),
    4
  );
  assert_eq!(wiki["items"][0]["label"], "current");
  assert_eq!(wiki["items"][0]["insertText"], "current");
  let mut many = (*index).clone();
  many
    .paths
    .extend((0..250).map(|number| format!("docs/note-{number:03}.md")));
  let capped = complete(&many, "[Note](note", "file:///notes/current.md").await;
  assert_eq!(capped["items"].as_array().expect("capped files").len(), 100);
  assert_eq!(capped["isIncomplete"], true);
}

#[path = "completion_context_tests.rs"]
mod context;

#[tokio::test]
async fn embedded_mermaid_completion_translates_both_edit_edges_to_document_lines() {
  let service = LanguageService::default();
  let text = "# Document\n\n```mermaid\nsequenceDiagram\n  part\n```\n";
  service
    .open(
      "window".into(),
      OpenRequest {
        uri: "file:///note.md".into(),
        path: Some("note.md".into()),
        language_id: "markdown".into(),
        text: text.into(),
        version: 1,
      },
    )
    .await
    .unwrap();
  let document = service
    .snapshot("window".into(), "file:///note.md".into(), 1)
    .await
    .unwrap();
  let (_directory, index) = fixture().await;
  let result = completion(
    &index,
    &document,
    Position {
      line: 4,
      character: 6,
    },
  )
  .unwrap();
  let wire = serde_json::to_value(result).unwrap();
  let participant = wire["items"]
    .as_array()
    .unwrap()
    .iter()
    .find(|item| item["label"] == "participant")
    .unwrap();
  assert_eq!(
    participant["textEdit"]["range"],
    json!({
      "start": { "line": 4, "character": 2 }, "end": { "line": 4, "character": 6 }
    })
  );
}
