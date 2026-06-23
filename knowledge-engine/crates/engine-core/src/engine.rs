use std::collections::HashMap;

use marklab_knowledge_protocol::{
  error_response, success_response, JsonRpcRequest, ENGINE_VERSION, PROTOCOL_VERSION,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::types::{
  EngineError, WorkspaceDocumentParams, WorkspaceOpenParams, WorkspaceParams, WorkspacePathParams,
  WorkspacePrefixParams, WorkspaceRebuildParams, WorkspaceSearchParams,
};
use crate::workspace_store::WorkspaceStore;

#[derive(Default)]
pub struct KnowledgeEngine {
  shutdown_requested: bool,
  workspaces: HashMap<String, WorkspaceStore>,
}

impl KnowledgeEngine {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn handle_request(&mut self, request: &JsonRpcRequest) -> String {
    let result = match request.method.as_str() {
      "initialize" => Ok(initialize_result_json()),
      "knowledge/health" => Ok(health_result_json()),
      "shutdown" => {
        self.shutdown_requested = true;
        Ok(json!({ "ok": true }))
      }
      "workspace/open" => self.workspace_open(request.params.as_ref()),
      "workspace/hasDocuments" => self.workspace_has_documents(request.params.as_ref()),
      "workspace/rebuild" => self.workspace_rebuild(request.params.as_ref()),
      "workspace/upsertDocument" => self.workspace_upsert_document(request.params.as_ref()),
      "workspace/removeDocument" => self.workspace_remove_document(request.params.as_ref()),
      "workspace/removePathPrefix" => self.workspace_remove_path_prefix(request.params.as_ref()),
      "workspace/search" => self.workspace_search(request.params.as_ref()),
      _ => Err(EngineError::method_not_found()),
    };

    match result {
      Ok(value) => success_response(request.id.as_ref(), value),
      Err(error) => error_response(request.id.as_ref(), error.code, &error.message),
    }
  }

  pub fn shutdown_requested(&self) -> bool {
    self.shutdown_requested
  }

  fn workspace_open(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspaceOpenParams>(params)?;
    let store = WorkspaceStore::open(params.index_path).map_err(EngineError::internal)?;
    let documents = store.document_count().map_err(EngineError::internal)?;
    self.workspaces.insert(params.workspace_id.clone(), store);

    Ok(json!({
        "ok": true,
        "workspaceId": params.workspace_id,
        "documents": documents,
    }))
  }

  fn workspace_has_documents(&self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspaceParams>(params)?;
    let has_documents = self
      .workspaces
      .get(&params.workspace_id)
      .map(|workspace| workspace.has_documents())
      .transpose()
      .map_err(EngineError::internal)?
      .unwrap_or(false);

    Ok(json!({ "hasDocuments": has_documents }))
  }

  fn workspace_rebuild(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspaceRebuildParams>(params)?;
    let workspace = self.require_workspace(&params.workspace_id)?;
    let count = workspace
      .rebuild(&params.documents)
      .map_err(EngineError::internal)?;

    Ok(json!({ "ok": true, "workspaceId": params.workspace_id, "documents": count }))
  }

  fn workspace_upsert_document(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspaceDocumentParams>(params)?;
    let workspace = self.require_workspace(&params.workspace_id)?;
    let count = workspace
      .upsert_document(&params.document)
      .map_err(EngineError::internal)?;

    Ok(json!({ "ok": true, "workspaceId": params.workspace_id, "documents": count }))
  }

  fn workspace_remove_document(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspacePathParams>(params)?;
    let workspace = self.require_workspace(&params.workspace_id)?;
    let count = workspace
      .remove_document(&params.path)
      .map_err(EngineError::internal)?;

    Ok(json!({ "ok": true, "workspaceId": params.workspace_id, "documents": count }))
  }

  fn workspace_remove_path_prefix(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspacePrefixParams>(params)?;
    let workspace = self.require_workspace(&params.workspace_id)?;
    let count = workspace
      .remove_path_prefix(&params.prefix)
      .map_err(EngineError::internal)?;

    Ok(json!({ "ok": true, "workspaceId": params.workspace_id, "documents": count }))
  }

  fn workspace_search(&self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspaceSearchParams>(params)?;
    let Some(workspace) = self.workspaces.get(&params.workspace_id) else {
      return Ok(json!([]));
    };

    Ok(Value::Array(
      workspace
        .search(&params.query, params.limit)
        .map_err(EngineError::internal)?,
    ))
  }

  fn require_workspace(&self, workspace_id: &str) -> Result<&WorkspaceStore, EngineError> {
    self
      .workspaces
      .get(workspace_id)
      .ok_or_else(|| EngineError::invalid_params("Workspace is not opened"))
  }
}

fn initialize_result_json() -> Value {
  json!({
      "protocolVersion": PROTOCOL_VERSION,
      "engineVersion": ENGINE_VERSION,
      "capabilities": {
          "health": true,
          "shutdown": true,
          "workspaceOpen": true,
          "workspaceSearch": true,
          "metadataStore": "redb",
          "searchIndex": "tantivy",
      },
  })
}

fn health_result_json() -> Value {
  json!({
      "status": "ready",
      "metadata": "redb",
      "search": "tantivy",
  })
}

fn parse_params<T: for<'de> Deserialize<'de>>(params: Option<&Value>) -> Result<T, EngineError> {
  let Some(params) = params else {
    return Err(EngineError::invalid_params("Missing params"));
  };

  serde_json::from_value(params.clone()).map_err(|_| EngineError::invalid_params("Invalid params"))
}

#[cfg(test)]
mod tests {
  use std::fs;
  use std::time::{SystemTime, UNIX_EPOCH};

  use super::*;

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
}
