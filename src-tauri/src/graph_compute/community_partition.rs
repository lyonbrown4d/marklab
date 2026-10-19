use std::collections::{BTreeSet, VecDeque};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::AtomicBool;

use graphrs::{Edge, Graph, GraphSpecs, Node, algorithms::community::louvain::louvain_communities};

use crate::error::BackendResult;

use super::ensure_running;
use super::graph::{CommunityGraph, failed};

const PAGE_SIZE: usize = 80;
const RESOLUTIONS: [f64; 4] = [1.0, 2.0, 4.0, 8.0];

pub(super) fn partition(
  graph: &CommunityGraph<'_>,
  members: Vec<usize>,
  cancelled: &AtomicBool,
) -> BackendResult<Vec<Vec<usize>>> {
  if members.is_empty() {
    return Ok(Vec::new());
  }
  // Bound third-party modularity work, not workspace availability. Very large
  // topologies retain every node through adjacency-based display pagination.
  let edge_budget = members
    .iter()
    .map(|index| graph.adjacency[*index].len())
    .sum::<usize>();
  if members.len() > 5_000 || edge_budget > 50_000 {
    return relation_pages(graph, &members, cancelled);
  }
  let mut pending = VecDeque::from([(members, 0)]);
  let mut result = Vec::new();
  while let Some((members, depth)) = pending.pop_front() {
    ensure_running(cancelled)?;
    let groups = louvain(graph, &members, RESOLUTIONS[depth], cancelled)?;
    for group in groups {
      if group.len() <= PAGE_SIZE {
        result.push(group);
      } else if depth + 1 < RESOLUTIONS.len() {
        pending.push_back((group, depth + 1));
      } else {
        // This is display pagination of a detected community, not another
        // community algorithm. Traversal follows real links, never paths.
        result.extend(relation_pages(graph, &group, cancelled)?);
      }
    }
  }
  Ok(result)
}

fn louvain(
  data: &CommunityGraph<'_>,
  members: &[usize],
  resolution: f64,
  cancelled: &AtomicBool,
) -> BackendResult<Vec<Vec<usize>>> {
  let member_set: BTreeSet<_> = members.iter().copied().collect();
  ensure_running(cancelled)?;
  // graphrs contains internal panics. Contain both graph construction and the
  // algorithm; cancellation is checked around it, not inside third-party work.
  let outcome = catch_unwind(AssertUnwindSafe(|| -> BackendResult<_> {
    let mut graph: Graph<usize, ()> = Graph::new(GraphSpecs::undirected());
    for member in members {
      ensure_running(cancelled)?;
      graph.add_node(Node::from_name(*member));
    }
    for source in members {
      ensure_running(cancelled)?;
      for target in &data.adjacency[*source] {
        if source < target && member_set.contains(target) {
          graph
            .add_edge(Edge::new(*source, *target))
            .map_err(|_| failed("Unable to build community graph"))?;
        }
      }
    }
    louvain_communities(&graph, false, Some(resolution), None, Some(42))
      .map_err(|_| failed("Community detection failed"))
  }));
  ensure_running(cancelled)?;
  let groups = outcome.map_err(|_| failed("Community detection failed safely"))??;
  let mut seen = BTreeSet::new();
  let mut result = Vec::with_capacity(groups.len());
  for group in groups {
    let mut group: Vec<_> = group.into_iter().collect();
    group.sort_unstable();
    if group.is_empty()
      || group
        .iter()
        .any(|member| !member_set.contains(member) || !seen.insert(*member))
    {
      return Err(failed("Community detection returned an invalid partition"));
    }
    result.push(group);
  }
  if seen != member_set {
    return Err(failed("Community detection omitted graph nodes"));
  }
  result.sort();
  Ok(result)
}

fn relation_pages(
  graph: &CommunityGraph<'_>,
  members: &[usize],
  cancelled: &AtomicBool,
) -> BackendResult<Vec<Vec<usize>>> {
  let mut remaining: BTreeSet<_> = members.iter().copied().collect();
  let mut pages = Vec::new();
  while let Some(seed) = remaining.pop_first() {
    let mut ordered = Vec::new();
    let mut queue = VecDeque::from([seed]);
    while let Some(node) = queue.pop_front() {
      ensure_running(cancelled)?;
      ordered.push(node);
      for neighbor in &graph.adjacency[node] {
        if remaining.remove(neighbor) {
          queue.push_back(*neighbor);
        }
      }
    }
    pages.extend(ordered.chunks(PAGE_SIZE).map(|chunk| {
      let mut page = chunk.to_vec();
      page.sort_unstable();
      page
    }));
  }
  Ok(pages)
}
