use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use moka::sync::Cache;
use serde_json::Value;

use crate::markdown_documents::{
  MarkdownDocumentChangeError, MarkdownDocumentEdit, MarkdownDocumentPosition,
  MarkdownDocumentRange, MarkdownDocumentStore,
};
use crate::markdown_extract::MarkdownLink;
use crate::markdown_graph::{
  build_outline_graph, build_workspace_graph, WorkspaceGraph, WorkspaceGraphDocument,
  WorkspaceGraphKnownPaths,
};
use crate::types::{SearchDocument, SearchQuery, SearchResultSet};
use crate::workspace_store::WorkspaceStore;

const WORKSPACE_GRAPH_CACHE_CAPACITY: u64 = 16;
const OUTLINE_GRAPH_CACHE_CAPACITY: u64 = 128;

#[derive(Debug, Clone, PartialEq)]
pub struct WorkspaceSearchResult {
  pub document_id: String,
  pub path: String,
  pub title: String,
  pub line: u32,
  pub column: u32,
  pub end_column: u32,
  pub snippet: String,
  pub snippet_highlights: Vec<WorkspaceSearchHighlight>,
  pub score: f32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceSearchHighlight {
  pub start: u32,
  pub end: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceMarkdownSymbol {
  pub name: String,
  pub kind: u32,
  pub level: u32,
  pub slug: String,
  pub line: usize,
  pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceMarkdownLink {
  pub source_document_id: String,
  pub text: String,
  pub target: String,
  pub line: usize,
  pub column: usize,
  pub is_external: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkspaceDocumentPosition {
  pub line: usize,
  pub character: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkspaceDocumentRange {
  pub start: WorkspaceDocumentPosition,
  pub end: WorkspaceDocumentPosition,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceDocumentEdit {
  pub range: WorkspaceDocumentRange,
  pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceDocumentChange {
  pub document_id: String,
  pub base_version: u64,
  pub version: u64,
  pub edits: Vec<WorkspaceDocumentEdit>,
}

pub struct WorkspaceEngine {
  workspace: WorkspaceStore,
  markdown_documents: MarkdownDocumentStore,
  workspace_graph_cache: Cache<WorkspaceGraphCacheKey, WorkspaceGraph>,
  outline_graph_cache: Cache<OutlineGraphCacheKey, WorkspaceGraph>,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct WorkspaceGraphCacheKey {
  documents: Vec<WorkspaceGraphDocumentCacheKey>,
  known_paths: Vec<String>,
  asset_paths: Vec<String>,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct WorkspaceGraphDocumentCacheKey {
  path: String,
  title: String,
  content_len: usize,
  content_hash: u64,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct OutlineGraphCacheKey {
  path: String,
  content_len: usize,
  content_hash: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceStatusSnapshot {
  pub health: WorkspaceHealthSnapshot,
  pub index: WorkspaceIndexStatus,
  pub storage: WorkspaceStorageStats,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceHealthSnapshot {
  pub ok: bool,
  pub state: String,
  pub metadata_documents: usize,
  pub searchable_documents: usize,
  pub pending_outbox_events: usize,
  pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceIndexStatus {
  pub search_index: String,
  pub ready: bool,
  pub metadata_documents: usize,
  pub searchable_documents: usize,
  pub pending_outbox_events: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceStorageStats {
  pub metadata_store: String,
  pub search_index: String,
  pub metadata_bytes: u64,
  pub search_index_bytes: u64,
  pub total_bytes: u64,
  pub metadata_documents: usize,
  pub pending_outbox_events: usize,
  pub blob_store: bool,
  pub blob_bytes: u64,
}

impl WorkspaceEngine {
  pub fn open(index_path: impl Into<PathBuf>) -> Result<Self, String> {
    Ok(Self {
      workspace: WorkspaceStore::open(index_path)?,
      markdown_documents: MarkdownDocumentStore::default(),
      workspace_graph_cache: Cache::builder()
        .max_capacity(WORKSPACE_GRAPH_CACHE_CAPACITY)
        .build(),
      outline_graph_cache: Cache::builder()
        .max_capacity(OUTLINE_GRAPH_CACHE_CAPACITY)
        .build(),
    })
  }

  pub fn search(&self, query: &str, limit: usize) -> Result<Vec<WorkspaceSearchResult>, String> {
    self
      .search_with_query(&SearchQuery::new(query, limit))
      .map(|set| set.results)
  }

  pub fn search_with_query(
    &self,
    query: &SearchQuery,
  ) -> Result<SearchResultSet<WorkspaceSearchResult>, String> {
    let response = self.workspace.search(query)?;

    let results = response
      .results
      .into_iter()
      .map(search_result_from_value)
      .collect::<Result<Vec<_>, _>>()?;

    Ok(SearchResultSet {
      results,
      total_hits: response.total_hits,
    })
  }

  pub fn document_count(&self) -> Result<usize, String> {
    self.workspace.document_count()
  }

  pub fn has_documents(&self) -> Result<bool, String> {
    self.workspace.has_documents()
  }

  pub fn rebuild(&self, documents: &[SearchDocument]) -> Result<usize, String> {
    self.workspace.rebuild(documents)
  }

  pub fn upsert_document(&self, document: &SearchDocument) -> Result<usize, String> {
    self.workspace.upsert_document(document)
  }

  pub fn remove_document(&self, path: &str) -> Result<usize, String> {
    self.workspace.remove_document(path)
  }

  pub fn remove_path_prefix(&self, prefix: &str) -> Result<usize, String> {
    self.workspace.remove_path_prefix(prefix)
  }

  pub fn workspace_graph(
    &self,
    documents: &[WorkspaceGraphDocument],
    known_paths: WorkspaceGraphKnownPaths,
  ) -> WorkspaceGraph {
    let key = workspace_graph_cache_key(documents, &known_paths);
    if let Some(graph) = self.workspace_graph_cache.get(&key) {
      return graph;
    }

    let graph = build_workspace_graph(documents, known_paths);
    self.workspace_graph_cache.insert(key, graph.clone());
    graph
  }

  pub fn outline_graph(&self, path: &str, content: &str) -> WorkspaceGraph {
    let key = outline_graph_cache_key(path, content);
    if let Some(graph) = self.outline_graph_cache.get(&key) {
      return graph;
    }

    let graph = build_outline_graph(path, content);
    self.outline_graph_cache.insert(key, graph.clone());
    graph
  }

  pub fn open_markdown_document(&mut self, document_id: String, content: String, version: u64) {
    self
      .markdown_documents
      .open_or_replace(document_id, content, Some(version));
  }

  pub fn change_markdown_document(
    &mut self,
    change: WorkspaceDocumentChange,
  ) -> Result<(), String> {
    let edits = change
      .edits
      .into_iter()
      .map(markdown_edit_from)
      .collect::<Vec<_>>();
    self
      .markdown_documents
      .apply_changes(
        &change.document_id,
        change.base_version,
        change.version,
        &edits,
      )
      .map(|_| ())
      .map_err(markdown_change_error_message)
  }

  pub fn close_markdown_document(&mut self, document_id: &str) -> bool {
    self.markdown_documents.close(document_id)
  }

  pub fn document_symbols(&self, document_id: &str) -> Vec<WorkspaceMarkdownSymbol> {
    self
      .markdown_documents
      .document_symbols(document_id)
      .into_iter()
      .map(|symbol| WorkspaceMarkdownSymbol {
        name: symbol.name,
        kind: u32::from(symbol.kind),
        level: u32::from(symbol.level),
        slug: symbol.slug,
        line: symbol.line,
        column: symbol.column,
      })
      .collect()
  }

  pub fn links(&self, document_id: &str) -> Vec<WorkspaceMarkdownLink> {
    self
      .markdown_documents
      .links(document_id)
      .into_iter()
      .map(markdown_link_from)
      .collect()
  }

  pub fn workspace_status(&self) -> Result<WorkspaceStatusSnapshot, String> {
    let status = self.workspace.status()?;
    let mut warnings = Vec::new();
    if status.pending_outbox_events > 0 {
      warnings.push(format!(
        "{} pending search index outbox event(s)",
        status.pending_outbox_events
      ));
    }
    if status.searchable_documents < status.metadata_documents {
      warnings.push("search index has fewer documents than metadata store".to_string());
    }
    let ready = status.pending_outbox_events == 0;

    Ok(WorkspaceStatusSnapshot {
      health: WorkspaceHealthSnapshot {
        ok: warnings.is_empty(),
        state: if warnings.is_empty() {
          "ready"
        } else {
          "degraded"
        }
        .to_string(),
        metadata_documents: status.metadata_documents,
        searchable_documents: status.searchable_documents,
        pending_outbox_events: status.pending_outbox_events,
        warnings,
      },
      index: WorkspaceIndexStatus {
        search_index: "tantivy".to_string(),
        ready,
        metadata_documents: status.metadata_documents,
        searchable_documents: status.searchable_documents,
        pending_outbox_events: status.pending_outbox_events,
      },
      storage: WorkspaceStorageStats {
        metadata_store: "redb".to_string(),
        search_index: "tantivy".to_string(),
        metadata_bytes: status.metadata_bytes,
        search_index_bytes: status.search_index_bytes,
        total_bytes: status.total_bytes,
        metadata_documents: status.metadata_documents,
        pending_outbox_events: status.pending_outbox_events,
        blob_store: false,
        blob_bytes: 0,
      },
    })
  }
}

fn workspace_graph_cache_key(
  documents: &[WorkspaceGraphDocument],
  known_paths: &WorkspaceGraphKnownPaths,
) -> WorkspaceGraphCacheKey {
  WorkspaceGraphCacheKey {
    documents: documents
      .iter()
      .map(|document| WorkspaceGraphDocumentCacheKey {
        path: document.path.clone(),
        title: document.title.clone(),
        content_len: document.content.len(),
        content_hash: hash_text(&document.content),
      })
      .collect(),
    known_paths: sorted_unique_paths(&known_paths.paths),
    asset_paths: sorted_unique_paths(&known_paths.asset_paths),
  }
}

fn outline_graph_cache_key(path: &str, content: &str) -> OutlineGraphCacheKey {
  OutlineGraphCacheKey {
    path: path.to_string(),
    content_len: content.len(),
    content_hash: hash_text(content),
  }
}

fn sorted_unique_paths(paths: &[String]) -> Vec<String> {
  let mut sorted = paths.to_vec();
  sorted.sort();
  sorted.dedup();
  sorted
}

fn hash_text(value: &str) -> u64 {
  let mut hasher = DefaultHasher::new();
  value.hash(&mut hasher);
  hasher.finish()
}

fn search_result_from_value(value: Value) -> Result<WorkspaceSearchResult, String> {
  let path = string_field(&value, "path")?;

  Ok(WorkspaceSearchResult {
    document_id: path.clone(),
    path,
    title: string_field(&value, "title")?,
    line: u32_field(&value, "line")?,
    column: u32_field(&value, "column")?,
    end_column: u32_field(&value, "end_column")?,
    snippet: string_field(&value, "snippet")?,
    snippet_highlights: search_highlights_from_value(&value)?,
    score: number_field(&value, "score")?,
  })
}

fn string_field(value: &Value, field: &str) -> Result<String, String> {
  value
    .get(field)
    .and_then(Value::as_str)
    .map(ToOwned::to_owned)
    .ok_or_else(|| format!("Workspace search result missing string field `{field}`"))
}

fn number_field(value: &Value, field: &str) -> Result<f32, String> {
  value
    .get(field)
    .and_then(Value::as_f64)
    .map(|score| score as f32)
    .ok_or_else(|| format!("Workspace search result missing number field `{field}`"))
}

fn u32_field(value: &Value, field: &str) -> Result<u32, String> {
  value
    .get(field)
    .and_then(Value::as_u64)
    .map(saturating_u32)
    .ok_or_else(|| format!("Workspace search result missing u32 field `{field}`"))
}

fn search_highlights_from_value(value: &Value) -> Result<Vec<WorkspaceSearchHighlight>, String> {
  value
    .get("snippet_highlights")
    .and_then(Value::as_array)
    .map(|values| {
      values
        .iter()
        .map(|value| {
          Ok(WorkspaceSearchHighlight {
            start: u32_field(value, "start")?,
            end: u32_field(value, "end")?,
          })
        })
        .collect()
    })
    .unwrap_or_else(|| Ok(Vec::new()))
}

fn saturating_u32(value: u64) -> u32 {
  value.min(u64::from(u32::MAX)) as u32
}

fn markdown_link_from(link: MarkdownLink) -> WorkspaceMarkdownLink {
  WorkspaceMarkdownLink {
    source_document_id: link.source_path,
    text: link.text,
    target: link.target,
    line: link.line,
    column: link.column,
    is_external: link.is_external,
  }
}

fn markdown_edit_from(edit: WorkspaceDocumentEdit) -> MarkdownDocumentEdit {
  MarkdownDocumentEdit {
    range: MarkdownDocumentRange {
      start: MarkdownDocumentPosition {
        line: edit.range.start.line,
        character: edit.range.start.character,
      },
      end: MarkdownDocumentPosition {
        line: edit.range.end.line,
        character: edit.range.end.character,
      },
    },
    text: edit.text,
  }
}

fn markdown_change_error_message(error: MarkdownDocumentChangeError) -> String {
  match error {
    MarkdownDocumentChangeError::DocumentNotOpen => "document is not open".to_string(),
    MarkdownDocumentChangeError::InvalidRange => "document change range is invalid".to_string(),
    MarkdownDocumentChangeError::VersionMismatch => "document version does not match".to_string(),
  }
}
