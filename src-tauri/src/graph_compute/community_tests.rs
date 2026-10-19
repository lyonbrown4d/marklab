use std::collections::BTreeSet;
use std::sync::atomic::AtomicBool;

use super::{
  GraphCommunityEdge, GraphCommunityNode, GraphCommunityRequest, GraphCommunityResult,
  detect_communities,
};

fn request(count: usize, edges: &[(usize, usize)]) -> GraphCommunityRequest {
  GraphCommunityRequest {
    request_id: "community-test".to_owned(),
    nodes: (0..count)
      .map(|index| GraphCommunityNode {
        id: format!("node-{index:04}"),
        label: format!("Note {index}"),
      })
      .collect(),
    edges: edges
      .iter()
      .map(|(source, target)| GraphCommunityEdge {
        source: format!("node-{source:04}"),
        target: format!("node-{target:04}"),
      })
      .collect(),
  }
}

fn detect(request: &GraphCommunityRequest) -> GraphCommunityResult {
  match detect_communities(request, &AtomicBool::new(false)) {
    Ok(result) => result,
    Err(error) => panic!("Unexpected community error: {error}"),
  }
}

fn bridged_cliques() -> GraphCommunityRequest {
  let mut edges = Vec::new();
  for start in [0, 6] {
    for source in start..start + 6 {
      for target in source + 1..start + 6 {
        edges.push((source, target));
      }
    }
  }
  edges.push((5, 6));
  request(12, &edges)
}

fn assert_complete(result: &GraphCommunityResult, request: &GraphCommunityRequest) {
  let actual: Vec<_> = result
    .communities
    .iter()
    .flat_map(|community| community.node_ids.iter().cloned())
    .collect();
  let unique: BTreeSet<_> = actual.iter().cloned().collect();
  let expected: BTreeSet<_> = request.nodes.iter().map(|node| node.id.clone()).collect();
  assert_eq!(actual.len(), unique.len(), "Every node occurs exactly once");
  assert_eq!(unique, expected);
}

#[test]
fn dense_groups_separate_across_a_weak_bridge() {
  let request = bridged_cliques();
  let result = detect(&request);
  assert_eq!(result.communities.len(), 2);
  assert_eq!(
    result.communities[0].node_ids,
    request.nodes[..6]
      .iter()
      .map(|node| node.id.clone())
      .collect::<Vec<_>>()
  );
  assert_eq!(
    result.communities[1].node_ids,
    request.nodes[6..]
      .iter()
      .map(|node| node.id.clone())
      .collect::<Vec<_>>()
  );
  assert_complete(&result, &request);
}

#[test]
fn reordered_and_reciprocal_links_preserve_membership_ids_and_labels() {
  let request = bridged_cliques();
  let original = detect(&request);
  let mut reordered = request.clone();
  reordered.nodes.reverse();
  reordered.edges.reverse();
  for edge in &mut reordered.edges {
    std::mem::swap(&mut edge.source, &mut edge.target);
  }
  reordered.edges.push(reordered.edges[0].clone());
  reordered.edges.push(GraphCommunityEdge {
    source: "node-0000".to_owned(),
    target: "node-0000".to_owned(),
  });
  assert_eq!(detect(&reordered), original);
  assert!(reordered.normalize().is_ok());
  assert_eq!(reordered.edges.len(), request.edges.len());
  assert!(reordered.edges.iter().all(|edge| edge.source < edge.target));
  assert_eq!(detect(&reordered), original);
  // All internal clique degrees tie; canonical node IDs choose the label.
  assert_eq!(original.communities[0].label, "Note 0");
  assert_eq!(original.communities[1].label, "Note 6");
}

#[test]
fn empty_and_maximum_isolated_graphs_stay_compact() {
  assert!(detect(&request(0, &[])).communities.is_empty());
  assert_eq!(detect(&request(2, &[])).communities[0].label, "未连接");
  let isolated = request(5_000, &[]);
  let result = detect(&isolated);
  assert_eq!(result.communities.len(), 63);
  assert_eq!(result.communities[0].label, "未连接 1");
  assert_eq!(result.communities[62].label, "未连接 63");
  assert!(
    result
      .communities
      .iter()
      .all(|community| community.node_ids.len() <= 80)
  );
  assert_complete(&result, &isolated);
}

#[test]
fn large_connected_graphs_have_bounded_pages_without_losing_nodes() {
  let edges: Vec<_> = (1..241).map(|target| (0, target)).collect();
  let request = request(241, &edges);
  let result = detect(&request);
  assert!(result.communities.len() > 1);
  assert!(
    result
      .communities
      .iter()
      .all(|community| community.node_ids.len() <= 80)
  );
  assert_complete(&result, &request);
}

#[test]
fn invalid_requests_and_unknown_fields_are_rejected() {
  let mut invalid = Vec::new();
  let mut duplicate = request(2, &[]);
  duplicate.nodes[1].id = duplicate.nodes[0].id.clone();
  invalid.push(duplicate);
  invalid.push(request(1, &[(0, 1)]));
  let mut long_id = request(1, &[]);
  long_id.nodes[0].id = "x".repeat(1025);
  invalid.push(long_id);
  let mut long_label = request(1, &[]);
  long_label.nodes[0].label = "x".repeat(4097);
  invalid.push(long_label);
  let mut whitespace_id = request(1, &[]);
  whitespace_id.nodes[0].id = "  ".to_owned();
  invalid.push(whitespace_id);
  let mut nul_id = request(1, &[]);
  nul_id.request_id = "invalid\0request".to_owned();
  invalid.push(nul_id);
  for mut request in invalid {
    let result = detect_communities(&request, &AtomicBool::new(false));
    assert!(matches!(result, Err(error) if error.code == "INVALID_REQUEST"));
    assert!(matches!(request.normalize(), Err(error) if error.code == "INVALID_REQUEST"));
  }
  for json in [
    r#"{"requestId":"x","nodes":[],"edges":[],"extra":true}"#,
    r#"{"requestId":"x","nodes":[{"id":"a","label":"A","extra":true}],"edges":[]}"#,
    r#"{"requestId":"x","nodes":[],"edges":[{"source":"a","target":"b","extra":true}]}"#,
  ] {
    assert!(serde_json::from_str::<GraphCommunityRequest>(json).is_err());
  }
}

#[test]
fn cancelled_requests_return_the_cancellation_contract() {
  let result = detect_communities(&bridged_cliques(), &AtomicBool::new(true));
  assert!(matches!(result, Err(error) if error.code == "GRAPH_CANCELLED"));
}

#[test]
fn topology_above_algorithm_budget_still_opens_bounded_link_pages() {
  let edges: Vec<_> = (1..5_001).map(|target| (target - 1, target)).collect();
  let oversized = request(5_001, &edges);
  let result = detect(&oversized);
  assert!(
    result
      .communities
      .iter()
      .all(|group| group.node_ids.len() <= 80)
  );
  assert_complete(&result, &oversized);
  let mut dense = request(2, &vec![(0, 1); 25_001]);
  assert!(dense.normalize().is_ok());
  assert_complete(&detect(&dense), &dense);
}
