use std::collections::{BTreeMap, BTreeSet};
use tokio_util::sync::CancellationToken;

use crate::error::{BackendError, BackendResult};

use super::{
  GraphCommunity, GraphCommunityNode, GraphCommunityRequest, community_id, ensure_running,
};

pub(super) struct CommunityGraph<'a> {
  pub nodes: Vec<&'a GraphCommunityNode>,
  pub adjacency: Vec<Vec<usize>>,
}

impl<'a> CommunityGraph<'a> {
  pub fn new(
    request: &'a GraphCommunityRequest,
    cancelled: &CancellationToken,
  ) -> BackendResult<Self> {
    if !valid_id(&request.request_id) {
      return Err(invalid("Invalid graph request ID"));
    }
    let mut nodes: Vec<_> = request.nodes.iter().collect();
    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    let mut indexes = BTreeMap::new();
    for (index, node) in nodes.iter().enumerate() {
      ensure_running(cancelled)?;
      if !valid_id(&node.id) || node.label.len() > 4096 {
        return Err(invalid("Invalid graph node ID or label"));
      }
      if indexes.insert(node.id.as_str(), index).is_some() {
        return Err(invalid("Graph node IDs must be unique"));
      }
    }
    let mut edges = BTreeSet::new();
    for edge in &request.edges {
      ensure_running(cancelled)?;
      let source = indexes
        .get(edge.source.as_str())
        .copied()
        .ok_or_else(|| invalid("Graph edge source does not exist"))?;
      let target = indexes
        .get(edge.target.as_str())
        .copied()
        .ok_or_else(|| invalid("Graph edge target does not exist"))?;
      // File self-links cannot connect communities; reciprocal links count once.
      if source != target {
        edges.insert((source.min(target), source.max(target)));
      }
    }
    let mut adjacency = vec![Vec::new(); nodes.len()];
    for (source, target) in edges {
      adjacency[source].push(target);
      adjacency[target].push(source);
    }
    for neighbors in &mut adjacency {
      neighbors.sort_unstable();
    }
    Ok(Self { nodes, adjacency })
  }

  pub fn community(&self, members: &[usize], label: Option<&str>) -> BackendResult<GraphCommunity> {
    let member_set: BTreeSet<_> = members.iter().copied().collect();
    let representative = members
      .iter()
      .copied()
      .min_by_key(|index| {
        let degree = self.adjacency[*index]
          .iter()
          .filter(|neighbor| member_set.contains(*neighbor))
          .count();
        (std::cmp::Reverse(degree), *index)
      })
      .ok_or_else(|| failed("Community detection produced an empty community"))?;
    let node = self.nodes[representative];
    let label = label.unwrap_or(if node.label.is_empty() {
      &node.id
    } else {
      &node.label
    });
    let node_ids = members
      .iter()
      .map(|index| self.nodes[*index].id.clone())
      .collect::<Vec<_>>();
    Ok(GraphCommunity {
      id: community_id(&node_ids),
      label: label.to_owned(),
      node_ids,
      unlinked_page: None,
    })
  }
}

pub(super) fn failed(message: &str) -> BackendError {
  BackendError::new("GRAPH_COMMUNITY_FAILED", message)
}

fn invalid(message: &str) -> BackendError {
  BackendError::new("INVALID_REQUEST", message)
}

fn valid_id(value: &str) -> bool {
  !value.trim().is_empty() && value.len() <= 1024 && !value.contains('\0')
}
