pub use super::graph_types::*;
pub use super::publication::publication;
use super::{Index, document::Document, targets};
use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub fn revision(index: &Index) -> String {
  format!("{}:{}", index.generation, index.revision)
}

pub fn graph(index: &Index) -> WorkspaceGraph {
  let mut nodes = BTreeMap::new();
  let mut edges = BTreeMap::new();
  for document in index.files.values() {
    let id = format!("file:{}", document.path);
    let folder = document
      .path
      .rsplit_once('/')
      .map_or("Workspace", |(folder, _)| folder);
    nodes.insert(
      id.clone(),
      GraphNode::File {
        id,
        label: document.title.clone(),
        path: document.path.clone(),
        group: GraphGroup {
          key: folder.into(),
          label: folder.into(),
          source: GroupSource::Path,
        },
      },
    );
  }
  for document in index.files.values() {
    let source = format!("file:{}", document.path);
    for link in document.links.iter().chain(&document.assets) {
      if link.is_external {
        continue;
      }
      let path = link.target_path.as_deref().unwrap_or(&link.target);
      let missing = targets::is_missing(link, &index.files, &index.paths);
      let (target, kind) = if index.files.contains_key(path) && !missing {
        (
          format!("file:{path}"),
          if link.target_heading_slug.is_some() {
            EdgeKind::ReferencesHeading
          } else {
            EdgeKind::LinksTo
          },
        )
      } else if index.paths.contains(path) {
        (format!("preview:{path}"), EdgeKind::Previews)
      } else {
        (format!("missing:{path}"), EdgeKind::LinksTo)
      };
      if target == source {
        continue;
      }
      nodes.entry(target.clone()).or_insert_with(|| {
        if index.paths.contains(path) {
          GraphNode::Preview {
            id: target.clone(),
            label: path.into(),
            path: path.into(),
            source_path: document.path.clone(),
            target: link.target.clone(),
            preview_kind: preview_kind(path),
          }
        } else {
          GraphNode::Missing {
            id: target.clone(),
            label: path.into(),
            path: path.into(),
            source_path: document.path.clone(),
            target: link.target.clone(),
            preview_kind: preview_kind(path),
          }
        }
      });
      let (a, b) = if source < target {
        (source.clone(), target)
      } else {
        (target, source.clone())
      };
      edges
        .entry((a.clone(), b.clone()))
        .or_insert_with(|| GraphEdge {
          id: format!("edge:{a}:{b}"),
          source: a,
          target: b,
          kind,
        });
    }
  }
  WorkspaceGraph {
    mode: GraphMode::Mindmap,
    revision: revision(index),
    nodes: nodes.into_values().collect(),
    edges: edges.into_values().collect(),
  }
}

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

fn preview_kind(path: &str) -> PreviewKind {
  match std::path::Path::new(path)
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or("")
    .to_lowercase()
    .as_str()
  {
    "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" => PreviewKind::Image,
    "pdf" => PreviewKind::Pdf,
    "docx" => PreviewKind::Docx,
    "mp3" | "wav" | "ogg" => PreviewKind::Audio,
    "mp4" | "webm" => PreviewKind::Video,
    "drawio" => PreviewKind::Drawio,
    "excalidraw" => PreviewKind::Excalidraw,
    "xlsx" | "xlsm" => PreviewKind::Spreadsheet,
    _ => PreviewKind::Source,
  }
}
