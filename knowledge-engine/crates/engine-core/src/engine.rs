use std::collections::HashMap;

use marklab_knowledge_protocol::{
  error_response, success_response, JsonRpcRequest, ENGINE_VERSION, PROTOCOL_VERSION,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::markdown_documents::MarkdownDocumentStore;
use crate::markdown_extract::extract_markdown;
use crate::types::{
  EngineError, MarkdownDocumentParams, MarkdownExtractParams, MarkdownPathParams,
  WorkspaceDocumentParams, WorkspaceOpenParams, WorkspaceParams, WorkspacePathParams,
  WorkspacePrefixParams, WorkspaceRebuildParams, WorkspaceSearchParams,
};
use crate::workspace_store::WorkspaceStore;

#[derive(Default)]
pub struct KnowledgeEngine {
  shutdown_requested: bool,
  workspaces: HashMap<String, WorkspaceStore>,
  markdown_documents: MarkdownDocumentStore,
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
      "workspace/close" => self.workspace_close(request.params.as_ref()),
      "workspace/hasDocuments" => self.workspace_has_documents(request.params.as_ref()),
      "workspace/rebuild" => self.workspace_rebuild(request.params.as_ref()),
      "workspace/upsertDocument" => self.workspace_upsert_document(request.params.as_ref()),
      "workspace/removeDocument" => self.workspace_remove_document(request.params.as_ref()),
      "workspace/removePathPrefix" => self.workspace_remove_path_prefix(request.params.as_ref()),
      "workspace/search" => self.workspace_search(request.params.as_ref()),
      "markdown/extract" => self.markdown_extract(request.params.as_ref()),
      "markdown/didOpen" => self.markdown_did_open(request.params.as_ref()),
      "markdown/didChange" => self.markdown_did_change(request.params.as_ref()),
      "markdown/didClose" => self.markdown_did_close(request.params.as_ref()),
      "markdown/documentSymbols" => self.markdown_document_symbols(request.params.as_ref()),
      "markdown/links" => self.markdown_links(request.params.as_ref()),
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

  fn workspace_close(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<WorkspaceParams>(params)?;
    let existed = self.workspaces.remove(&params.workspace_id).is_some();

    Ok(json!({
        "ok": true,
        "workspaceId": params.workspace_id,
        "closed": existed,
    }))
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

  fn markdown_extract(&self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<MarkdownExtractParams>(params)?;
    serde_json::to_value(extract_markdown(&params.path, &params.content))
      .map_err(|error| EngineError::internal(error.to_string()))
  }

  fn markdown_did_open(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<MarkdownDocumentParams>(params)?;
    let snapshot =
      self
        .markdown_documents
        .open_or_change(params.path, params.content, params.version);
    serde_json::to_value(snapshot).map_err(|error| EngineError::internal(error.to_string()))
  }

  fn markdown_did_change(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<MarkdownDocumentParams>(params)?;
    let snapshot =
      self
        .markdown_documents
        .open_or_change(params.path, params.content, params.version);
    serde_json::to_value(snapshot).map_err(|error| EngineError::internal(error.to_string()))
  }

  fn markdown_did_close(&mut self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<MarkdownPathParams>(params)?;
    let closed = self.markdown_documents.close(&params.path);

    Ok(json!({
        "ok": true,
        "path": params.path,
        "closed": closed,
    }))
  }

  fn markdown_document_symbols(&self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<MarkdownPathParams>(params)?;
    serde_json::to_value(self.markdown_documents.document_symbols(&params.path))
      .map_err(|error| EngineError::internal(error.to_string()))
  }

  fn markdown_links(&self, params: Option<&Value>) -> Result<Value, EngineError> {
    let params = parse_params::<MarkdownPathParams>(params)?;
    serde_json::to_value(self.markdown_documents.links(&params.path))
      .map_err(|error| EngineError::internal(error.to_string()))
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
            "workspaceClose": true,
            "workspaceSearch": true,
            "markdownExtract": true,
            "markdownDocumentOverlay": true,
            "markdownDocumentSymbols": true,
            "markdownLinks": true,
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
