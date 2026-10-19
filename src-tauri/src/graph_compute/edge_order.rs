use super::types::{GraphLayoutComputeEdge, GraphLayoutComputeNode};
use crate::error::BackendResult;
use std::collections::{BTreeMap, BTreeSet};

pub(super) struct OrderedEdges {
  pub(super) edges: Vec<(usize, usize)>,
  pub(super) estimated_dummy_nodes: usize,
}

/// Orient cyclic relationships consistently, then insert sources in topological
/// order. layout-rs's reachability routine enumerates paths; this ordering makes
/// each target a leaf during its cycle check instead of traversing a dense DAG.
pub(super) fn ordered_edges(
  nodes: &[GraphLayoutComputeNode],
  edges: &[GraphLayoutComputeEdge],
) -> BackendResult<OrderedEdges> {
  let indexes: BTreeMap<_, _> = nodes
    .iter()
    .enumerate()
    .map(|(index, node)| (node.id.as_str(), index))
    .collect();
  let mut adjacency = vec![Vec::new(); nodes.len()];
  for edge in edges {
    let source = *indexes
      .get(edge.source.as_str())
      .ok_or_else(|| super::types::invalid("Unknown edge source"))?;
    let target = *indexes
      .get(edge.target.as_str())
      .ok_or_else(|| super::types::invalid("Unknown edge target"))?;
    if source != target {
      adjacency[source].push(target);
    }
  }
  let mut visited = vec![false; nodes.len()];
  let mut order = Vec::with_capacity(nodes.len());
  for start in 0..nodes.len() {
    let mut stack = vec![(start, false)];
    while let Some((node, closing)) = stack.pop() {
      if closing {
        order.push(node);
        continue;
      }
      if visited[node] {
        continue;
      }
      visited[node] = true;
      stack.push((node, true));
      for &next in adjacency[node].iter().rev() {
        if !visited[next] {
          stack.push((next, false));
        }
      }
    }
  }
  order.reverse();
  let mut ranks = vec![0; nodes.len()];
  for (rank, &node) in order.iter().enumerate() {
    ranks[node] = rank;
  }
  let mut oriented = BTreeSet::new();
  for (source, targets) in adjacency.iter().enumerate() {
    for &target in targets {
      let from = ranks[source].min(ranks[target]);
      let to = ranks[source].max(ranks[target]);
      oriented.insert((from, to));
    }
  }
  // Topological index distance bounds rank distance from above. Refuse the
  // expensive layered path before long edges can create thousands of nodes.
  let estimated_dummy_nodes = oriented
    .iter()
    .map(|(source, target)| target - source - 1)
    .sum();
  Ok(OrderedEdges {
    edges: oriented
      .into_iter()
      .map(|(source, target)| (order[source], order[target]))
      .collect(),
    estimated_dummy_nodes,
  })
}
