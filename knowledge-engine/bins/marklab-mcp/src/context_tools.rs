use std::fs;
use std::path::PathBuf;

use marklab_knowledge_engine_core::{
  SearchQuery, WorkspaceEngine, WorkspaceSearchResult, WorkspaceStatusSnapshot,
};
use serde_json::{json, Map, Value};
use thiserror::Error;

pub(crate) const TOOL_WORKSPACE_STATUS: &str = "marklab_workspace_status";
pub(crate) const TOOL_SEARCH_WORKSPACE: &str = "marklab_search_workspace";

const MAX_SEARCH_LIMIT: usize = 50;

#[derive(Debug, Clone)]
pub(crate) struct McpContextConfig {
  workspace_root: PathBuf,
  engine_data_dir: PathBuf,
  default_search_limit: usize,
}

impl McpContextConfig {
  pub(crate) fn new(
    workspace_root: PathBuf,
    engine_data_dir: PathBuf,
    default_search_limit: usize,
  ) -> Self {
    Self {
      workspace_root,
      engine_data_dir,
      default_search_limit: clamp_limit(default_search_limit),
    }
  }
}

pub(crate) struct McpContextTools {
  config: McpContextConfig,
  engine: WorkspaceEngine,
}

#[derive(Debug)]
pub(crate) struct ToolOutput {
  pub(crate) structured_content: Value,
}

#[derive(Debug, Error)]
pub(crate) enum ContextToolError {
  #[error("workspace root is not readable: {0}")]
  WorkspaceRoot(String),
  #[error("knowledge engine failed: {0}")]
  KnowledgeEngine(String),
  #[error("unknown MarkLab MCP tool: {0}")]
  UnknownTool(String),
  #[error("missing required string argument `{0}`")]
  MissingStringArgument(&'static str),
  #[error("argument `{0}` must be a string")]
  InvalidStringArgument(&'static str),
  #[error("argument `{0}` must be an object")]
  InvalidObjectArgument(&'static str),
  #[error("argument `{0}` must be a positive integer")]
  InvalidIntegerArgument(&'static str),
}

impl ContextToolError {
  pub(crate) fn is_unknown_tool(&self) -> bool {
    matches!(self, Self::UnknownTool(_))
  }
}

impl McpContextTools {
  pub(crate) fn open(config: McpContextConfig) -> Result<Self, ContextToolError> {
    let workspace_root = fs::canonicalize(&config.workspace_root)
      .map_err(|error| ContextToolError::WorkspaceRoot(error.to_string()))?;
    let config = McpContextConfig {
      workspace_root,
      engine_data_dir: config.engine_data_dir,
      default_search_limit: config.default_search_limit,
    };
    let engine = WorkspaceEngine::open(config.engine_data_dir.clone())
      .map_err(ContextToolError::KnowledgeEngine)?;

    Ok(Self { config, engine })
  }

  pub(crate) fn call_tool(
    &self,
    name: &str,
    arguments: Option<&Value>,
  ) -> Result<ToolOutput, ContextToolError> {
    match name {
      TOOL_WORKSPACE_STATUS => self.workspace_status(),
      TOOL_SEARCH_WORKSPACE => self.search_workspace(arguments),
      _ => Err(ContextToolError::UnknownTool(name.to_string())),
    }
  }

  fn workspace_status(&self) -> Result<ToolOutput, ContextToolError> {
    let status = self
      .engine
      .workspace_status()
      .map_err(ContextToolError::KnowledgeEngine)?;

    Ok(ToolOutput {
      structured_content: status_json(
        &self.config.workspace_root,
        &self.config.engine_data_dir,
        &status,
      ),
    })
  }

  fn search_workspace(&self, arguments: Option<&Value>) -> Result<ToolOutput, ContextToolError> {
    let arguments = object_arguments(arguments, "arguments")?;
    let query = required_string_argument(arguments, "query")?;
    let limit =
      optional_limit_argument(arguments, "limit")?.unwrap_or(self.config.default_search_limit);
    let search_query = SearchQuery::new(query, limit);
    let result_set = self
      .engine
      .search_with_query(&search_query)
      .map_err(ContextToolError::KnowledgeEngine)?;
    let results = result_set
      .results
      .iter()
      .map(search_result_json)
      .collect::<Vec<_>>();

    Ok(ToolOutput {
      structured_content: json!({
        "query": query,
        "limit": search_query.limit,
        "totalHits": result_set.total_hits,
        "resultCount": results.len(),
        "results": results,
      }),
    })
  }

  #[cfg(test)]
  pub(crate) fn from_engine(config: McpContextConfig, engine: WorkspaceEngine) -> Self {
    Self { config, engine }
  }
}

fn status_json(
  workspace_root: &std::path::Path,
  engine_data_dir: &std::path::Path,
  status: &WorkspaceStatusSnapshot,
) -> Value {
  json!({
    "workspaceRoot": workspace_root.display().to_string(),
    "engineDataDir": engine_data_dir.display().to_string(),
    "health": {
      "ok": status.health.ok,
      "state": status.health.state,
      "metadataDocuments": status.health.metadata_documents,
      "searchableDocuments": status.health.searchable_documents,
      "pendingOutboxEvents": status.health.pending_outbox_events,
      "warnings": status.health.warnings,
    },
    "index": {
      "searchIndex": status.index.search_index,
      "ready": status.index.ready,
      "metadataDocuments": status.index.metadata_documents,
      "searchableDocuments": status.index.searchable_documents,
      "pendingOutboxEvents": status.index.pending_outbox_events,
    },
    "storage": {
      "metadataStore": status.storage.metadata_store,
      "searchIndex": status.storage.search_index,
      "metadataBytes": status.storage.metadata_bytes,
      "searchIndexBytes": status.storage.search_index_bytes,
      "totalBytes": status.storage.total_bytes,
      "metadataDocuments": status.storage.metadata_documents,
      "pendingOutboxEvents": status.storage.pending_outbox_events,
      "blobStore": status.storage.blob_store,
      "blobBytes": status.storage.blob_bytes,
    }
  })
}

fn search_result_json(result: &WorkspaceSearchResult) -> Value {
  let highlights = result
    .snippet_highlights
    .iter()
    .map(|highlight| {
      json!({
        "start": highlight.start,
        "end": highlight.end,
      })
    })
    .collect::<Vec<_>>();

  json!({
    "documentId": result.document_id,
    "path": result.path,
    "title": result.title,
    "line": result.line,
    "column": result.column,
    "endColumn": result.end_column,
    "snippet": result.snippet,
    "snippetHighlights": highlights,
    "score": result.score,
  })
}

fn object_arguments<'a>(
  arguments: Option<&'a Value>,
  field: &'static str,
) -> Result<&'a Map<String, Value>, ContextToolError> {
  match arguments {
    Some(Value::Object(map)) => Ok(map),
    Some(_) => Err(ContextToolError::InvalidObjectArgument(field)),
    None => Err(ContextToolError::MissingStringArgument("query")),
  }
}

fn required_string_argument<'a>(
  arguments: &'a Map<String, Value>,
  field: &'static str,
) -> Result<&'a str, ContextToolError> {
  match arguments.get(field) {
    Some(Value::String(value)) => Ok(value),
    Some(_) => Err(ContextToolError::InvalidStringArgument(field)),
    None => Err(ContextToolError::MissingStringArgument(field)),
  }
}

fn optional_limit_argument(
  arguments: &Map<String, Value>,
  field: &'static str,
) -> Result<Option<usize>, ContextToolError> {
  match arguments.get(field) {
    Some(Value::Number(value)) => value
      .as_u64()
      .and_then(|limit| usize::try_from(limit).ok())
      .map(clamp_limit)
      .map(Some)
      .ok_or(ContextToolError::InvalidIntegerArgument(field)),
    Some(_) => Err(ContextToolError::InvalidIntegerArgument(field)),
    None => Ok(None),
  }
}

fn clamp_limit(limit: usize) -> usize {
  limit.clamp(1, MAX_SEARCH_LIMIT)
}

#[cfg(test)]
mod tests {
  use std::time::{SystemTime, UNIX_EPOCH};

  use marklab_knowledge_engine_core::SearchDocument;

  use super::*;

  #[test]
  fn search_tool_reads_existing_workspace_index() {
    let engine =
      WorkspaceEngine::open(unique_test_path("search-tool")).expect("workspace engine should open");
    engine
      .rebuild(&[SearchDocument {
        path: "notes/project.md".to_string(),
        title: "Project".to_string(),
        content: "alpha context lives here".to_string(),
      }])
      .expect("workspace index should rebuild");
    let tools = McpContextTools::from_engine(
      McpContextConfig::new(
        PathBuf::from("/workspace"),
        PathBuf::from("/engine-data"),
        10,
      ),
      engine,
    );

    let output = tools
      .call_tool(
        TOOL_SEARCH_WORKSPACE,
        Some(&json!({
          "query": "alpha",
          "limit": 5,
        })),
      )
      .expect("search tool should return results");

    assert_eq!(output.structured_content["resultCount"], 1);
    assert_eq!(
      output.structured_content["results"][0]["path"],
      "notes/project.md"
    );
  }

  fn unique_test_path(label: &str) -> String {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_nanos())
      .unwrap_or_default();
    let path = std::env::temp_dir().join(format!("marklab-mcp-{label}-{nanos}"));
    let _ = fs::remove_dir_all(&path);
    path.to_string_lossy().to_string()
  }
}
