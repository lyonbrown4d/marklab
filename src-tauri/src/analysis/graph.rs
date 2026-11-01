pub use super::graph_types::*;
pub use super::publication::publication;
use super::{Index, document::Document};
use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub fn revision(index: &Index) -> String {
  format!("{}:{}", index.generation, index.revision)
}

pub use super::graph_projection::graph;

#[derive(Deserialize, Serialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct DetailsRequest {
  pub revision: String,
  pub node_ids: Vec<String>,
  pub mode: String,
  #[serde(default)]
  pub max_nodes: Option<usize>,
}

pub fn details(index: &Index, request: DetailsRequest) -> BackendResult<GraphDetails> {
  let limit = request.max_nodes.unwrap_or(32);
  if !(1..=64).contains(&limit)
    || request.node_ids.is_empty()
    || request.node_ids.len() > 256
    || !["summary", "full"].contains(&request.mode.as_str())
    || request
      .node_ids
      .iter()
      .any(|id| id.is_empty() || id.len() > 1024)
  {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Invalid graph details query",
    ));
  }
  if request.revision != revision(index) {
    return Err(BackendError::new(
      "GRAPH_REVISION_MISMATCH",
      "Workspace graph changed; reload the topology",
    ));
  }
  let mut seen = BTreeSet::new();
  let selected: Vec<_> = request
    .node_ids
    .into_iter()
    .filter(|id| seen.insert(id.clone()))
    .collect();
  let items: Vec<_> = selected
    .iter()
    .take(limit)
    .filter_map(|id| {
      id.strip_prefix("file:")
        .and_then(|path| index.files.get(path))
        .map(|file| {
          let content = summary(file);
          let preview = super::graph_preview::render(&content);
          GraphDetail {
            id: id.clone(),
            content,
            preview,
            content_blocks: (request.mode == "full").then(|| blocks(file)),
          }
        })
    })
    .collect();
  Ok(GraphDetails {
    items,
    revision: request.revision,
    truncated: selected.len() > limit,
  })
}

pub fn summary(file: &Document) -> String {
  file
    .content
    .lines()
    .filter(|line| !line.trim_start().starts_with('#') && !line.trim().is_empty())
    .take(3)
    .collect::<Vec<_>>()
    .join("\n")
    .chars()
    .take(420)
    .collect()
}

fn blocks(file: &Document) -> Vec<MarkdownBlock> {
  let mut blocks = Vec::new();
  let mut text = String::new();
  let mut code: Option<String> = None;
  for line in file.content.lines().take(2000) {
    if line.trim_start().starts_with("```") {
      if let Some(language) = code.take() {
        blocks.push(MarkdownBlock::Code {
          id: format!("{}:block:{}", file.path, blocks.len()),
          text: std::mem::take(&mut text),
          language,
        });
      } else {
        code = Some(line.trim_start().trim_start_matches('`').trim().into());
      }
    } else if code.is_some() {
      text.push_str(line);
      text.push('\n');
    } else if !line.trim().is_empty() {
      let id = format!("{}:block:{}", file.path, blocks.len());
      let text = line.chars().take(16384).collect();
      blocks.push(if line.starts_with('>') {
        MarkdownBlock::Blockquote { id, text }
      } else {
        MarkdownBlock::Paragraph { id, text }
      });
    }
    if blocks.len() >= 24 {
      break;
    }
  }
  blocks
}
