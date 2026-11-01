use super::{Index, graph_types::*};
use crate::error::{BackendError, BackendResult};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub(super) fn validate(request: &WorkspaceGraphRequest) -> BackendResult<()> {
  let invalid_path = request.center_path.as_deref().is_some_and(|path| {
    path.is_empty()
      || path.len() > 4096
      || path.trim() != path
      || path.contains(['\0', '\\', ':'])
      || path.starts_with('/')
      || path
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
  });
  if invalid_path
    || !(1..=2).contains(&request.depth)
    || !(1..=10_000).contains(&request.max_nodes)
    || !(1..=50_000).contains(&request.max_edges)
  {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Invalid workspace graph query",
    ));
  }
  Ok(())
}

pub(super) fn select(
  index: &Index,
  request: WorkspaceGraphRequest,
  mut nodes: BTreeMap<String, GraphNode>,
  edges: Vec<GraphEdge>,
) -> BackendResult<WorkspaceGraph> {
  let ordered = if let Some(path) = &request.center_path {
    let center = format!("file:{path}");
    if !nodes.contains_key(&center) {
      return Err(BackendError::new(
        "NOT_FOUND",
        "Graph center document is unavailable",
      ));
    }
    neighborhood(&center, &edges, request.depth, request.direction)
  } else {
    nodes.keys().cloned().collect()
  };
  let eligible: BTreeSet<_> = ordered.iter().cloned().collect();
  let total_nodes = eligible.len();
  let scoped: Vec<_> = edges
    .into_iter()
    .filter(|edge| eligible.contains(&edge.source) && eligible.contains(&edge.target))
    .collect();
  let total_edges = scoped.len();
  let kept: BTreeSet<_> = ordered.iter().take(request.max_nodes).cloned().collect();
  let edges: Vec<_> = scoped
    .into_iter()
    .filter(|edge| kept.contains(&edge.source) && kept.contains(&edge.target))
    .take(request.max_edges)
    .collect();
  let nodes: Vec<_> = ordered
    .into_iter()
    .take(request.max_nodes)
    .filter_map(|id| nodes.remove(&id))
    .collect();
  let mut hash = Sha256::new();
  // Labels, source text and document revisions do not affect force-layout identity.
  for id in &kept {
    hash.update((id.len() as u64).to_le_bytes());
    hash.update(id.as_bytes());
  }
  for edge in &edges {
    hash.update((edge.id.len() as u64).to_le_bytes());
    hash.update(edge.id.as_bytes());
    hash.update((edge.count as u64).to_le_bytes());
  }
  Ok(WorkspaceGraph {
    mode: GraphMode::Relations,
    revision: super::graph::revision(index),
    topology_key: hex::encode(hash.finalize()),
    truncated: nodes.len() < total_nodes || edges.len() < total_edges,
    nodes,
    edges,
    total_nodes,
    total_edges,
  })
}

fn neighborhood(
  center: &str,
  edges: &[GraphEdge],
  depth: u8,
  direction: GraphDirection,
) -> Vec<String> {
  let mut adjacent = BTreeMap::<&str, BTreeSet<&str>>::new();
  for edge in edges {
    if direction != GraphDirection::Incoming {
      adjacent
        .entry(&edge.source)
        .or_default()
        .insert(&edge.target);
    }
    if direction != GraphDirection::Outgoing {
      adjacent
        .entry(&edge.target)
        .or_default()
        .insert(&edge.source);
    }
  }
  let mut seen = BTreeSet::from([center]);
  let mut pending = VecDeque::from([(center, 0)]);
  let mut ordered = Vec::new();
  while let Some((id, distance)) = pending.pop_front() {
    ordered.push(id.to_owned());
    if distance == depth {
      continue;
    }
    if let Some(neighbors) = adjacent.get(id) {
      for neighbor in neighbors {
        if seen.insert(neighbor) {
          pending.push_back((neighbor, distance + 1));
        }
      }
    }
  }
  ordered
}
