use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{BackendError, BackendResult};

#[path = "community_graph.rs"]
mod graph;
#[path = "community_partition.rs"]
mod partition;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphCommunityRequest {
  pub request_id: String,
  pub nodes: Vec<GraphCommunityNode>,
  pub edges: Vec<GraphCommunityEdge>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphCommunityNode {
  pub id: String,
  pub label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphCommunityEdge {
  pub source: String,
  pub target: String,
}

impl GraphCommunityRequest {
  pub(super) fn normalize(&mut self) -> BackendResult<()> {
    // Validate endpoints and metadata before normalization and cache lookup.
    graph::CommunityGraph::new(self, &AtomicBool::new(false))?;
    self.nodes.sort_by(|left, right| left.id.cmp(&right.id));
    for edge in &mut self.edges {
      if edge.source > edge.target {
        std::mem::swap(&mut edge.source, &mut edge.target);
      }
    }
    self.edges.retain(|edge| edge.source != edge.target);
    self
      .edges
      .sort_by(|left, right| (&left.source, &left.target).cmp(&(&right.source, &right.target)));
    self
      .edges
      .dedup_by(|left, right| left.source == right.source && left.target == right.target);
    Ok(())
  }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommunityResult {
  pub communities: Vec<GraphCommunity>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommunity {
  pub id: String,
  pub label: String,
  pub node_ids: Vec<String>,
  pub unlinked_page: Option<usize>,
}

/// Synchronous CPU work; the caller owns spawn_blocking, caching, and request lifetime.
pub fn detect_communities(
  request: &GraphCommunityRequest,
  cancelled: &AtomicBool,
) -> BackendResult<GraphCommunityResult> {
  ensure_running(cancelled)?;
  let graph = graph::CommunityGraph::new(request, cancelled)?;
  let mut connected = Vec::new();
  let mut isolated = Vec::new();
  for (index, neighbors) in graph.adjacency.iter().enumerate() {
    if neighbors.is_empty() {
      isolated.push(index);
    } else {
      connected.push(index);
    }
  }
  let mut groups = partition::partition(&graph, connected, cancelled)?;
  let mut communities = Vec::with_capacity(groups.len() + isolated.len().div_ceil(80));
  groups.sort();
  for members in groups {
    ensure_running(cancelled)?;
    communities.push(graph.community(&members, None)?);
  }
  // Isolates have no relation to paginate by. Canonical ID order keeps native
  // pages stable and keeps each display page within 80 nodes.
  for (page, members) in isolated.chunks(80).enumerate() {
    ensure_running(cancelled)?;
    let label = if isolated.len() <= 80 {
      "未连接".to_owned()
    } else {
      format!("未连接 {}", page + 1)
    };
    let mut community = graph.community(members, Some(&label))?;
    community.unlinked_page = Some(page + 1);
    communities.push(community);
  }
  ensure_running(cancelled)?;
  Ok(GraphCommunityResult { communities })
}

pub(super) fn ensure_running(cancelled: &AtomicBool) -> BackendResult<()> {
  if cancelled.load(Ordering::Relaxed) {
    return Err(BackendError::new(
      "GRAPH_CANCELLED",
      "Graph community detection was cancelled",
    ));
  }
  Ok(())
}

fn community_id(node_ids: &[String]) -> String {
  let mut digest = Sha256::new();
  for id in node_ids {
    // Length prefixes avoid ambiguity between IDs containing separators.
    digest.update((id.len() as u64).to_be_bytes());
    digest.update(id.as_bytes());
  }
  format!("community-{}", hex::encode(digest.finalize()))
}

#[cfg(test)]
#[path = "community_tests.rs"]
mod tests;
