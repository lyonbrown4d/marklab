use std::path::PathBuf;

use serde_json::Value;

use crate::markdown_documents::MarkdownDocumentStore;
use crate::markdown_extract::MarkdownLink;
use crate::workspace_store::WorkspaceStore;

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

pub struct WorkspaceEngine {
  workspace: WorkspaceStore,
  markdown_documents: MarkdownDocumentStore,
}

impl WorkspaceEngine {
  pub fn open(index_path: impl Into<PathBuf>) -> Result<Self, String> {
    Ok(Self {
      workspace: WorkspaceStore::open(index_path)?,
      markdown_documents: MarkdownDocumentStore::default(),
    })
  }

  pub fn search(&self, query: &str, limit: usize) -> Result<Vec<WorkspaceSearchResult>, String> {
    self
      .workspace
      .search(query, limit)?
      .into_iter()
      .map(search_result_from_value)
      .collect()
  }

  pub fn open_markdown_document(&mut self, document_id: String, content: String, version: u64) {
    self
      .markdown_documents
      .open_or_change(document_id, content, Some(version));
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
