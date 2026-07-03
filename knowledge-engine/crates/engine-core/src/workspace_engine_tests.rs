use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::markdown_graph::{WorkspaceGraphDocument, WorkspaceGraphKnownPaths};
use crate::types::SearchDocument;
use crate::workspace_engine::{
  WorkspaceDocumentChange, WorkspaceDocumentEdit, WorkspaceDocumentPosition,
  WorkspaceDocumentRange, WorkspaceEngine,
};

#[test]
fn search_uses_workspace_index() {
  let engine = open_test_engine("search");
  engine
    .rebuild(&[SearchDocument {
      path: "notes/project.md".to_string(),
      title: "project".to_string(),
      content: "alpha lives here\nbeta lives there".to_string(),
    }])
    .expect("rebuild should succeed");

  let results = engine.search("alpha beta", 10).expect("search should work");

  assert_eq!(results[0].path, "notes/project.md");
}

#[test]
fn open_overlay_feeds_symbols_and_links() {
  let mut engine = open_test_engine("overlay");

  engine.open_markdown_document(
    "notes/project.md".to_string(),
    "# Project\nSee [[Roadmap]]".to_string(),
    12,
  );

  assert_eq!(
    engine.document_symbols("notes/project.md")[0].name,
    "Project"
  );
  assert_eq!(engine.links("notes/project.md")[0].target, "Roadmap");
}

#[test]
fn change_overlay_updates_symbols() {
  let mut engine = open_test_engine("change");
  engine.open_markdown_document("notes/project.md".to_string(), "# Project".to_string(), 1);

  engine
    .change_markdown_document(WorkspaceDocumentChange {
      document_id: "notes/project.md".to_string(),
      base_version: 1,
      version: 2,
      edits: vec![WorkspaceDocumentEdit {
        range: WorkspaceDocumentRange {
          start: WorkspaceDocumentPosition {
            line: 0,
            character: 2,
          },
          end: WorkspaceDocumentPosition {
            line: 0,
            character: 9,
          },
        },
        text: "Updated".to_string(),
      }],
    })
    .expect("change should apply");

  assert_eq!(
    engine.document_symbols("notes/project.md")[0].name,
    "Updated"
  );
}

#[test]
fn graph_methods_reuse_results_without_stale_content() {
  let engine = open_test_engine("graph-cache");
  let documents = vec![
    graph_document(
      "notes/current.md",
      "# Current\nSee [Guide](../refs/guide.md).",
    ),
    graph_document("refs/guide.md", "# Guide"),
  ];
  let known_paths = WorkspaceGraphKnownPaths {
    paths: vec!["notes/current.md".to_string(), "refs/guide.md".to_string()],
    asset_paths: Vec::new(),
  };

  let first_workspace_graph = engine.workspace_graph(&documents, known_paths.clone());
  let second_workspace_graph = engine.workspace_graph(&documents, known_paths);

  assert_eq!(first_workspace_graph, second_workspace_graph);

  let outline_content = "# Project\n\n## Plan\nBody";
  let first_outline_graph = engine.outline_graph("notes/project.md", outline_content);
  let second_outline_graph = engine.outline_graph("notes/project.md", outline_content);
  let changed_outline_graph = engine.outline_graph("notes/project.md", "# Project\n\n## Done");

  assert_eq!(first_outline_graph, second_outline_graph);
  assert_ne!(first_outline_graph, changed_outline_graph);
}

fn open_test_engine(label: &str) -> WorkspaceEngine {
  WorkspaceEngine::open(unique_test_path(label)).expect("workspace engine should open")
}

fn unique_test_path(label: &str) -> String {
  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_nanos())
    .unwrap_or_default();
  let path = std::env::temp_dir().join(format!("marklab-workspace-engine-{label}-{nanos}"));
  let _ = fs::remove_dir_all(&path);
  path.to_string_lossy().to_string()
}

fn graph_document(path: &str, content: &str) -> WorkspaceGraphDocument {
  WorkspaceGraphDocument {
    path: path.to_string(),
    title: path.to_string(),
    content: content.to_string(),
  }
}
