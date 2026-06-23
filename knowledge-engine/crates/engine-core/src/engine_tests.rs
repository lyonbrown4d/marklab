use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use marklab_knowledge_protocol::JsonRpcRequest;
use serde_json::json;

use crate::engine::KnowledgeEngine;

#[test]
fn initializes_with_workspace_search_capability() {
  let mut engine = KnowledgeEngine::new();
  let request = JsonRpcRequest {
    id: Some(json!(1)),
    method: "initialize".to_string(),
    params: None,
  };

  let response = engine.handle_request(&request);

  assert!(response.contains(r#""workspaceSearch":true"#));
  assert!(response.contains(r#""metadataStore":"redb""#));
  assert!(response.contains(r#""searchIndex":"tantivy""#));
  assert!(response.contains(r#""markdownDocumentOverlay":true"#));
}

#[test]
fn searches_workspace_documents() {
  let mut engine = KnowledgeEngine::new();
  open_workspace(&mut engine, "main");
  let rebuild = JsonRpcRequest {
    id: Some(json!(1)),
    method: "workspace/rebuild".to_string(),
    params: Some(json!({
        "workspaceId": "main",
        "documents": [{
            "path": "notes/project.md",
            "title": "project",
            "content": "alpha lives here\nbeta lives there"
        }]
    })),
  };
  let search = JsonRpcRequest {
    id: Some(json!(2)),
    method: "workspace/search".to_string(),
    params: Some(json!({
        "workspaceId": "main",
        "query": "alpha beta",
        "limit": 10
    })),
  };

  engine.handle_request(&rebuild);
  let response = engine.handle_request(&search);

  assert!(response.contains(r#""path":"notes/project.md""#));
}

#[test]
fn closes_workspace_handles() {
  let mut engine = KnowledgeEngine::new();
  open_workspace(&mut engine, "main");
  let close = JsonRpcRequest {
    id: Some(json!(4)),
    method: "workspace/close".to_string(),
    params: Some(json!({
        "workspaceId": "main",
    })),
  };

  let response = engine.handle_request(&close);

  assert!(response.contains(r#""closed":true"#));
}

#[test]
fn folds_case_and_common_accents() {
  let mut engine = KnowledgeEngine::new();
  open_workspace(&mut engine, "main");
  let rebuild = JsonRpcRequest {
    id: Some(json!(1)),
    method: "workspace/rebuild".to_string(),
    params: Some(json!({
        "workspaceId": "main",
        "documents": [{
            "path": "Notes/Café.md",
            "title": "Café",
            "content": "Résumé API"
        }]
    })),
  };
  let search = JsonRpcRequest {
    id: Some(json!(2)),
    method: "workspace/search".to_string(),
    params: Some(json!({
        "workspaceId": "main",
        "query": "CAFE resume",
        "limit": 10
    })),
  };

  engine.handle_request(&rebuild);
  let response = engine.handle_request(&search);

  assert!(response.contains(r#""path":"Notes/Café.md""#));
}

#[test]
fn stores_open_markdown_document_for_symbol_queries() {
  let mut engine = KnowledgeEngine::new();
  let open = JsonRpcRequest {
    id: Some(json!(1)),
    method: "markdown/didOpen".to_string(),
    params: Some(json!({
        "path": "notes/project.md",
        "content": "# Project\nSee [[Roadmap]]",
        "version": 12
    })),
  };
  let symbols = JsonRpcRequest {
    id: Some(json!(2)),
    method: "markdown/documentSymbols".to_string(),
    params: Some(json!({
        "path": "notes/project.md"
    })),
  };
  let links = JsonRpcRequest {
    id: Some(json!(3)),
    method: "markdown/links".to_string(),
    params: Some(json!({
        "path": "notes/project.md"
    })),
  };

  let open_response = engine.handle_request(&open);
  let symbols_response = engine.handle_request(&symbols);
  let links_response = engine.handle_request(&links);

  assert!(open_response.contains(r#""headingCount":1"#));
  assert!(open_response.contains(r#""linkCount":1"#));
  assert!(symbols_response.contains(r#""name":"Project""#));
  assert!(links_response.contains(r#""target":"Roadmap""#));
}

#[test]
fn records_shutdown_request() {
  let mut engine = KnowledgeEngine::new();
  let request = JsonRpcRequest {
    id: Some(json!(3)),
    method: "shutdown".to_string(),
    params: None,
  };

  let response = engine.handle_request(&request);

  assert!(response.contains(r#""ok":true"#));
  assert!(engine.shutdown_requested());
}

fn open_workspace(engine: &mut KnowledgeEngine, workspace_id: &str) {
  let index_path = unique_test_path(workspace_id);
  let request = JsonRpcRequest {
    id: Some(json!(0)),
    method: "workspace/open".to_string(),
    params: Some(json!({
        "workspaceId": workspace_id,
        "indexPath": index_path,
    })),
  };

  let response = engine.handle_request(&request);
  assert!(response.contains(r#""ok":true"#));
}

fn unique_test_path(label: &str) -> String {
  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_nanos())
    .unwrap_or_default();
  let path = std::env::temp_dir().join(format!("marklab-knowledge-engine-{label}-{nanos}"));
  let _ = fs::remove_dir_all(&path);
  path.to_string_lossy().to_string()
}
