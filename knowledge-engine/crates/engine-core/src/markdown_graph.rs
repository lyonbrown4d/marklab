use std::collections::{HashMap, HashSet};

use rayon::prelude::*;

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

struct IndexedMarkdownFile<'a> {
  path: String,
  content: &'a str,
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
  let known_asset_paths = known_asset_paths(&known_paths);
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
      if is_ignored_graph_link(file, link) {
        continue;
      }

      let Some(target) = workspace_graph_target(
        link,
        &files_by_path,
        &headings,
        &known_files,
        &known_asset_paths,
        &mut nodes,
        &mut added,
      ) else {
        continue;
      };
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

fn indexed_files<'a>(documents: &'a [WorkspaceGraphDocument]) -> Vec<IndexedMarkdownFile<'a>> {
  let mut files = documents
    .par_iter()
    .map(|document| {
      let path = normalize_workspace_path(&document.path);
      IndexedMarkdownFile {
        extraction: extract_markdown(&path, &document.content),
        content: &document.content,
        path,
      }
    })
    .collect::<Vec<_>>();
  files.sort_by(|left, right| left.path.cmp(&right.path));
  files
}

fn heading_nodes(files: &[IndexedMarkdownFile<'_>]) -> HashMap<String, WorkspaceGraphNode> {
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
  files_by_path: &HashMap<String, &IndexedMarkdownFile<'_>>,
  headings: &HashMap<String, WorkspaceGraphNode>,
  known_files: &[String],
  known_asset_paths: &HashSet<String>,
  nodes: &mut Vec<WorkspaceGraphNode>,
  added: &mut HashSet<String>,
) -> Option<GraphTarget> {
  if link.is_external {
    let id = format!("ext:{}", link.target);
    if added.insert(id.clone()) {
      nodes.push(external_node(&id, link));
    }
    return Some(GraphTarget {
      id,
      edge_kind: WorkspaceGraphEdgeKind::LinksTo,
      heading_path: None,
    });
  }

  let parsed = parse_graph_link_target(link, known_files);
  if is_asset_graph_target(&parsed.target_path, known_files, known_asset_paths) {
    return None;
  }

  if let Some(heading_slug) = parsed.heading_slug {
    let id = heading_node_id(&parsed.target_path, &heading_slug);
    if let Some(heading) = headings.get(&id) {
      if added.insert(id.clone()) {
        nodes.push(heading.clone());
      }
      return Some(GraphTarget {
        id,
        edge_kind: WorkspaceGraphEdgeKind::ReferencesHeading,
        heading_path: Some(parsed.target_path),
      });
    }
  }

  if files_by_path.contains_key(&parsed.target_path) {
    return Some(GraphTarget {
      id: file_node_id(&parsed.target_path),
      edge_kind: WorkspaceGraphEdgeKind::LinksTo,
      heading_path: None,
    });
  }

  let id = format!("missing:{}", parsed.target_path);
  if added.insert(id.clone()) {
    nodes.push(missing_node(&id, &parsed.target_path, link.line));
  }
  Some(GraphTarget {
    id,
    edge_kind: WorkspaceGraphEdgeKind::LinksTo,
    heading_path: None,
  })
}

fn is_asset_graph_target(
  target_path: &str,
  known_files: &[String],
  known_asset_paths: &HashSet<String>,
) -> bool {
  if known_asset_paths.contains(target_path) {
    return true;
  }
  if known_files.iter().any(|file| file == target_path) {
    return false;
  }
  has_non_markdown_extension(target_path)
}

fn has_non_markdown_extension(target_path: &str) -> bool {
  let name = target_path
    .rsplit('/')
    .next()
    .filter(|value| !value.is_empty())
    .unwrap_or(target_path);
  let Some((_, extension)) = name.rsplit_once('.') else {
    return false;
  };
  !matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
}

fn is_ignored_graph_link(file: &IndexedMarkdownFile<'_>, link: &MarkdownLink) -> bool {
  link_starts_in_code_context(file.content, link.line, link.column)
}

fn link_starts_in_code_context(content: &str, line_number: usize, column: usize) -> bool {
  let mut fence = GraphFenceState::default();
  for (line_index, line) in content.lines().enumerate() {
    let current_line = line_index + 1;
    if current_line == line_number {
      return fence.active() || link_starts_in_inline_code(line, column);
    }
    fence.apply_line(line);
  }
  false
}

fn link_starts_in_inline_code(line: &str, column: usize) -> bool {
  if column == 0 {
    return false;
  }
  let target_index = column - 1;
  inline_code_spans(line)
    .into_iter()
    .any(|(start, end)| target_index >= start && target_index < end)
}

fn inline_code_spans(line: &str) -> Vec<(usize, usize)> {
  let chars = line.chars().collect::<Vec<_>>();
  let mut spans = Vec::new();
  let mut open: Option<(usize, usize)> = None;
  let mut index = 0;

  while index < chars.len() {
    if chars[index] != '`' {
      index += 1;
      continue;
    }

    let length = chars[index..]
      .iter()
      .take_while(|value| **value == '`')
      .count();
    if let Some((start, open_length)) = open {
      if length == open_length {
        spans.push((start, index + length));
        open = None;
      }
    } else {
      open = Some((index, length));
    }
    index += length;
  }

  spans
}

#[derive(Default)]
struct GraphFenceState {
  marker: Option<char>,
  length: usize,
}

impl GraphFenceState {
  fn active(&self) -> bool {
    self.marker.is_some()
  }

  fn apply_line(&mut self, line: &str) {
    let Some((marker, length)) = graph_fence_marker(line) else {
      return;
    };

    if self.marker == Some(marker) && length >= self.length {
      self.marker = None;
      self.length = 0;
      return;
    }

    if self.marker.is_none() {
      self.marker = Some(marker);
      self.length = length;
    }
  }
}

fn graph_fence_marker(line: &str) -> Option<(char, usize)> {
  let chars = line.chars().collect::<Vec<_>>();
  let mut index = 0;

  while index < chars.len() && chars[index] == ' ' && index < 3 {
    index += 1;
  }

  let marker = *chars.get(index)?;
  if marker != '`' && marker != '~' {
    return None;
  }

  let mut length = 0;
  while chars.get(index + length) == Some(&marker) {
    length += 1;
  }

  (length >= 3).then_some((marker, length))
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
  files: &[IndexedMarkdownFile<'_>],
  known_paths: &WorkspaceGraphKnownPaths,
) -> Vec<String> {
  let mut paths = files
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
    .collect::<Vec<_>>();
  paths.sort();
  paths
}

fn known_asset_paths(known_paths: &WorkspaceGraphKnownPaths) -> HashSet<String> {
  known_paths
    .asset_paths
    .iter()
    .map(|path| normalize_workspace_path(path))
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
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn workspace_graph_resolves_markdown_wiki_and_heading_anchor_links() {
    let documents = vec![
      graph_document(
        "notes/current.md",
        "# Current\nSee [Guide](../refs/guide.md \"Guide\") and [[Guide]].\nJump [API](../refs/guide.md#API%20Reference) and [Top](#Current).",
      ),
      graph_document("refs/guide.md", "# Guide\n\n## API Reference\nDetails."),
    ];

    let graph = build_workspace_graph(
      &documents,
      WorkspaceGraphKnownPaths {
        paths: vec!["notes/current.md".to_string(), "refs/guide.md".to_string()],
        asset_paths: Vec::new(),
      },
    );

    assert!(has_edge(
      &graph,
      "file:notes/current.md",
      "file:refs/guide.md",
      WorkspaceGraphEdgeKind::LinksTo,
    ));
    assert!(has_edge(
      &graph,
      "file:notes/current.md",
      "heading:refs/guide.md:api-reference",
      WorkspaceGraphEdgeKind::ReferencesHeading,
    ));
    assert!(has_edge(
      &graph,
      "file:refs/guide.md",
      "heading:refs/guide.md:api-reference",
      WorkspaceGraphEdgeKind::Contains,
    ));
    assert!(has_edge(
      &graph,
      "file:notes/current.md",
      "heading:notes/current.md:current",
      WorkspaceGraphEdgeKind::ReferencesHeading,
    ));
    assert!(!graph.nodes.iter().any(|node| node.id == "missing:../refs/guide.md"));
  }

  #[test]
  fn workspace_graph_is_deterministic_when_document_input_order_changes() {
    let documents = vec![
      graph_document(
        "zeta.md",
        "# Zeta\n[Alpha](alpha.md).",
      ),
      graph_document(
        "alpha.md",
        "# Intro\n[Self](#Intro).\n[External](https://example.com).",
      ),
    ];
    let mut reversed_documents = documents.clone();
    reversed_documents.reverse();
    let known_paths = WorkspaceGraphKnownPaths {
      paths: vec!["zeta.md".to_string(), "alpha.md".to_string()],
      asset_paths: Vec::new(),
    };

    let graph = build_workspace_graph(&documents, known_paths.clone());
    let reversed_graph = build_workspace_graph(&reversed_documents, known_paths);

    assert_eq!(graph, reversed_graph);
    assert_eq!(
      graph
        .nodes
        .iter()
        .map(|node| node.id.as_str())
        .collect::<Vec<_>>(),
      vec![
        "file:alpha.md",
        "file:zeta.md",
        "heading:alpha.md:intro",
        "ext:https://example.com",
      ]
    );
  }

  #[test]
  fn workspace_graph_skips_asset_paths_and_code_pseudo_links() {
    let content = [
      "`[Inline](ghost.md)` and `[[InlineWiki]]` and [Real](target.md).",
      "",
      "```md",
      "[Code](ghost.md)",
      "[[CodeWiki]]",
      "```",
      "",
      "[Asset](../assets/spec.pdf)",
    ]
    .join("\n");
    let documents = vec![
      graph_document("notes/current.md", &content),
      graph_document("notes/target.md", "Target."),
    ];

    let graph = build_workspace_graph(
      &documents,
      WorkspaceGraphKnownPaths {
        paths: vec!["notes/current.md".to_string(), "notes/target.md".to_string()],
        asset_paths: vec!["assets/spec.pdf".to_string()],
      },
    );

    let link_edges = graph
      .edges
      .iter()
      .filter(|edge| edge.kind == WorkspaceGraphEdgeKind::LinksTo)
      .collect::<Vec<_>>();
    assert_eq!(link_edges.len(), 1);
    assert_eq!(link_edges[0].target, "file:notes/target.md");
    assert!(!graph.nodes.iter().any(|node| {
      node.id.contains("ghost") || node.id.contains("InlineWiki") || node.id.contains("spec.pdf")
    }));
  }

  fn graph_document(path: &str, content: &str) -> WorkspaceGraphDocument {
    WorkspaceGraphDocument {
      path: path.to_string(),
      title: file_label(path),
      content: content.to_string(),
    }
  }

  fn has_edge(
    graph: &WorkspaceGraph,
    source: &str,
    target: &str,
    kind: WorkspaceGraphEdgeKind,
  ) -> bool {
    graph
      .edges
      .iter()
      .any(|edge| edge.source == source && edge.target == target && edge.kind == kind)
  }
}
