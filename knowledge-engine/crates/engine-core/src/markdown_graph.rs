use std::collections::{HashMap, HashSet};

use crate::markdown_blocks::{parse_markdown_blocks, MarkdownGraphBlock};
use crate::markdown_extract::{
  extract_markdown, MarkdownExtraction, MarkdownHeading, MarkdownLink,
};
use crate::markdown_graph_paths::{
  external_label, file_label, file_node_id, heading_node_id, normalize_workspace_path,
  parse_graph_link_target,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceGraphDocument {
  pub path: String,
  pub title: String,
  pub content: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkspaceGraphKnownPaths {
  pub paths: Vec<String>,
  pub asset_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceGraph {
  pub mode: WorkspaceGraphMode,
  pub nodes: Vec<WorkspaceGraphNode>,
  pub edges: Vec<WorkspaceGraphEdge>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceGraphMode {
  Mindmap,
  Outline,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceGraphNode {
  pub id: String,
  pub kind: WorkspaceGraphNodeKind,
  pub label: String,
  pub path: Option<String>,
  pub line: Option<usize>,
  pub level: Option<u32>,
  pub slug: Option<String>,
  pub content: Option<String>,
  pub content_blocks: Vec<MarkdownGraphBlock>,
  pub content_start_line: Option<usize>,
  pub content_end_line: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceGraphNodeKind {
  File,
  Heading,
  Missing,
  External,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceGraphEdge {
  pub id: String,
  pub source: String,
  pub target: String,
  pub kind: WorkspaceGraphEdgeKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceGraphEdgeKind {
  Contains,
  LinksTo,
  ReferencesHeading,
}

struct IndexedMarkdownFile {
  path: String,
  extraction: MarkdownExtraction,
}

struct GraphTarget {
  id: String,
  edge_kind: WorkspaceGraphEdgeKind,
  heading_path: Option<String>,
}

pub fn build_workspace_graph(
  documents: &[WorkspaceGraphDocument],
  known_paths: WorkspaceGraphKnownPaths,
) -> WorkspaceGraph {
  let files = indexed_files(documents);
  let known_files = known_markdown_files(&files, &known_paths);
  let files_by_path = files
    .iter()
    .map(|file| (file.path.clone(), file))
    .collect::<HashMap<_, _>>();
  let mut nodes = files
    .iter()
    .map(|file| file_node(&file.path))
    .collect::<Vec<_>>();
  let headings = heading_nodes(&files);
  let mut added = nodes
    .iter()
    .map(|node| node.id.clone())
    .collect::<HashSet<_>>();
  let mut heading_contains_edges = HashSet::new();
  let mut edges = Vec::new();

  for file in &files {
    let source = file_node_id(&file.path);
    for link in &file.extraction.links {
      let target = workspace_graph_target(
        link,
        &files_by_path,
        &headings,
        &known_files,
        &mut nodes,
        &mut added,
      );
      if let Some(heading_path) = target.heading_path {
        add_heading_contains_edge(
          &heading_path,
          &target.id,
          &mut edges,
          &mut heading_contains_edges,
        );
      }
      edges.push(WorkspaceGraphEdge {
        id: format!("{}->{}-{}", source, target.id, edges.len()),
        source: source.clone(),
        target: target.id,
        kind: target.edge_kind,
      });
    }
  }

  WorkspaceGraph {
    mode: WorkspaceGraphMode::Mindmap,
    nodes,
    edges,
  }
}

pub fn build_outline_graph(file_path: &str, content: &str) -> WorkspaceGraph {
  let file_path = normalize_workspace_path(file_path);
  let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
  let lines = normalized.split('\n').collect::<Vec<_>>();
  let extraction = extract_markdown(&file_path, &normalized);
  let mut nodes = vec![file_node(&file_path)];
  let mut edges = Vec::new();
  let mut stack: Vec<(u8, String)> = Vec::new();

  for (index, heading) in extraction.headings.iter().enumerate() {
    let id = heading_node_id(&file_path, &heading.slug);
    let next_line = extraction
      .headings
      .get(index + 1)
      .map(|next| next.line)
      .unwrap_or(lines.len() + 1);
    let content_start_line = (heading.line + 1).min(next_line);
    let heading_content = heading_content(&lines, content_start_line, next_line);

    while stack
      .last()
      .is_some_and(|(level, _)| *level >= heading.level)
    {
      stack.pop();
    }
    let parent = stack
      .last()
      .map(|(_, parent_id)| parent_id.clone())
      .unwrap_or_else(|| file_node_id(&file_path));
    nodes.push(heading_node(
      &file_path,
      heading,
      Some(heading_content.clone()),
      parse_markdown_blocks(&id, &heading_content),
      Some(content_start_line),
      Some(next_line),
    ));
    edges.push(WorkspaceGraphEdge {
      id: format!("{parent}->{id}-{}", edges.len()),
      source: parent,
      target: id.clone(),
      kind: WorkspaceGraphEdgeKind::Contains,
    });
    stack.push((heading.level, id));
  }

  WorkspaceGraph {
    mode: WorkspaceGraphMode::Outline,
    nodes,
    edges,
  }
}

fn indexed_files(documents: &[WorkspaceGraphDocument]) -> Vec<IndexedMarkdownFile> {
  documents
    .iter()
    .map(|document| {
      let path = normalize_workspace_path(&document.path);
      IndexedMarkdownFile {
        extraction: extract_markdown(&path, &document.content),
        path,
      }
    })
    .collect()
}

fn heading_nodes(files: &[IndexedMarkdownFile]) -> HashMap<String, WorkspaceGraphNode> {
  let mut headings = HashMap::new();
  for file in files {
    for heading in &file.extraction.headings {
      headings.insert(
        heading_node_id(&file.path, &heading.slug),
        heading_node(&file.path, heading, None, Vec::new(), None, None),
      );
    }
  }
  headings
}

fn workspace_graph_target(
  link: &MarkdownLink,
  files_by_path: &HashMap<String, &IndexedMarkdownFile>,
  headings: &HashMap<String, WorkspaceGraphNode>,
  known_files: &[String],
  nodes: &mut Vec<WorkspaceGraphNode>,
  added: &mut HashSet<String>,
) -> GraphTarget {
  if link.is_external {
    let id = format!("ext:{}", link.target);
    if added.insert(id.clone()) {
      nodes.push(external_node(&id, link));
    }
    return GraphTarget {
      id,
      edge_kind: WorkspaceGraphEdgeKind::LinksTo,
      heading_path: None,
    };
  }

  let parsed = parse_graph_link_target(link, known_files);
  if let Some(heading_slug) = parsed.heading_slug {
    let id = heading_node_id(&parsed.target_path, &heading_slug);
    if let Some(heading) = headings.get(&id) {
      if added.insert(id.clone()) {
        nodes.push(heading.clone());
      }
      return GraphTarget {
        id,
        edge_kind: WorkspaceGraphEdgeKind::ReferencesHeading,
        heading_path: Some(parsed.target_path),
      };
    }
  }

  if files_by_path.contains_key(&parsed.target_path) {
    return GraphTarget {
      id: file_node_id(&parsed.target_path),
      edge_kind: WorkspaceGraphEdgeKind::LinksTo,
      heading_path: None,
    };
  }

  let id = format!("missing:{}", parsed.target_path);
  if added.insert(id.clone()) {
    nodes.push(missing_node(&id, &parsed.target_path, link.line));
  }
  GraphTarget {
    id,
    edge_kind: WorkspaceGraphEdgeKind::LinksTo,
    heading_path: None,
  }
}

fn file_node(file_path: &str) -> WorkspaceGraphNode {
  WorkspaceGraphNode {
    id: file_node_id(file_path),
    kind: WorkspaceGraphNodeKind::File,
    label: file_label(file_path),
    path: Some(file_path.to_string()),
    line: None,
    level: None,
    slug: None,
    content: None,
    content_blocks: Vec::new(),
    content_start_line: None,
    content_end_line: None,
  }
}

fn heading_node(
  file_path: &str,
  heading: &MarkdownHeading,
  content: Option<String>,
  content_blocks: Vec<MarkdownGraphBlock>,
  content_start_line: Option<usize>,
  content_end_line: Option<usize>,
) -> WorkspaceGraphNode {
  WorkspaceGraphNode {
    id: heading_node_id(file_path, &heading.slug),
    kind: WorkspaceGraphNodeKind::Heading,
    label: heading.text.clone(),
    path: Some(file_path.to_string()),
    line: Some(heading.line),
    level: Some(u32::from(heading.level)),
    slug: Some(heading.slug.clone()),
    content,
    content_blocks,
    content_start_line,
    content_end_line,
  }
}

fn external_node(id: &str, link: &MarkdownLink) -> WorkspaceGraphNode {
  WorkspaceGraphNode {
    id: id.to_string(),
    kind: WorkspaceGraphNodeKind::External,
    label: if link.text.trim().is_empty() {
      external_label(&link.target)
    } else {
      link.text.trim().to_string()
    },
    path: None,
    line: Some(link.line),
    level: None,
    slug: None,
    content: None,
    content_blocks: Vec::new(),
    content_start_line: None,
    content_end_line: None,
  }
}

fn missing_node(id: &str, path: &str, line: usize) -> WorkspaceGraphNode {
  WorkspaceGraphNode {
    id: id.to_string(),
    kind: WorkspaceGraphNodeKind::Missing,
    label: file_label(path),
    path: Some(path.to_string()),
    line: Some(line),
    level: None,
    slug: None,
    content: None,
    content_blocks: Vec::new(),
    content_start_line: None,
    content_end_line: None,
  }
}

fn add_heading_contains_edge(
  file_path: &str,
  heading_id: &str,
  edges: &mut Vec<WorkspaceGraphEdge>,
  added: &mut HashSet<String>,
) {
  let source = file_node_id(file_path);
  if !added.insert(format!("{source}->{heading_id}")) {
    return;
  }
  edges.push(WorkspaceGraphEdge {
    id: format!("{source}->{heading_id}-{}", edges.len()),
    source,
    target: heading_id.to_string(),
    kind: WorkspaceGraphEdgeKind::Contains,
  });
}

fn known_markdown_files(
  files: &[IndexedMarkdownFile],
  known_paths: &WorkspaceGraphKnownPaths,
) -> Vec<String> {
  files
    .iter()
    .map(|file| file.path.clone())
    .chain(
      known_paths
        .paths
        .iter()
        .map(|path| normalize_workspace_path(path)),
    )
    .collect::<HashSet<_>>()
    .into_iter()
    .collect()
}

fn heading_content(lines: &[&str], content_start_line: usize, next_line: usize) -> String {
  let start = content_start_line.saturating_sub(1);
  let end = next_line.saturating_sub(1).min(lines.len());
  if start >= end {
    return String::new();
  }
  lines[start..end].join("\n").trim_matches('\n').to_string()
}
