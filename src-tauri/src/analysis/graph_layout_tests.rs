use super::{
  graph, graph_layout,
  graph_tests::{index, request},
  graph_types::*,
};
use std::{collections::BTreeMap, sync::Arc};

fn coordinates(graph: &WorkspaceGraph) -> BTreeMap<String, GraphPosition> {
  graph
    .nodes
    .iter()
    .map(|node| {
      let position = match node {
        GraphNode::File { position, .. }
        | GraphNode::Preview { position, .. }
        | GraphNode::Missing { position, .. } => *position,
      };
      (node.id().to_owned(), position)
    })
    .collect()
}

#[test]
fn empty_single_and_disconnected_graphs_have_finite_distinct_positions() {
  let cache = graph_layout::cache();
  assert!(
    graph::graph(&index(&[], &[]), request(), &cache)
      .unwrap()
      .nodes
      .is_empty()
  );
  let single = graph::graph(&index(&[("a.md", "")], &[]), request(), &cache).unwrap();
  assert_eq!(coordinates(&single)["file:a.md"], GraphPosition::default());
  let documents = index(
    &[
      ("a.md", "[B](b.md) ![Cover](cover.png) [Absent](absent.md)"),
      ("b.md", ""),
      ("c.md", "[D](d.md)"),
      ("d.md", ""),
      ("isolated.md", ""),
    ],
    &["cover.png"],
  );
  let graph = graph::graph(&documents, request(), &cache).unwrap();
  let points: Vec<_> = coordinates(&graph).into_values().collect();
  assert_eq!(points.len(), 7);
  assert!(
    points
      .iter()
      .all(|point| point.x.is_finite() && point.y.is_finite())
  );
  for (i, point) in points.iter().enumerate() {
    assert!(
      points[i + 1..]
        .iter()
        .all(|other| { (point.x - other.x).hypot(point.y - other.y) > 0.01 })
    );
  }
  let wire = serde_json::to_value(&graph).unwrap();
  assert!(
    wire["nodes"]
      .as_array()
      .unwrap()
      .iter()
      .all(|node| { node["position"]["x"].is_number() && node["position"]["y"].is_number() })
  );
  let mut missing = wire["nodes"][0].clone();
  missing.as_object_mut().unwrap().remove("position");
  assert!(serde_json::from_value::<GraphNode>(missing).is_err());
}

#[test]
fn uncached_runs_and_differently_ordered_queries_produce_identical_coordinates() {
  let documents = index(
    &[
      ("a.md", "[B](b.md) [C](c.md)"),
      ("b.md", "[C](c.md)"),
      ("c.md", "[A](a.md)"),
    ],
    &[],
  );
  let global = graph::graph(&documents, request(), &graph_layout::cache()).unwrap();
  let repeated = graph::graph(&documents, request(), &graph_layout::cache()).unwrap();
  assert_eq!(coordinates(&global), coordinates(&repeated));
  let mut local_request = request();
  local_request.center_path = Some("c.md".into());
  let mut local = super::graph_projection::graph(&documents, local_request).unwrap();
  assert_eq!(global.topology_key, local.topology_key);
  assert_ne!(global.nodes[0].id(), local.nodes[0].id());
  local.edges.reverse();
  let points = graph_layout::positions(&graph_layout::cache(), &documents, &local).unwrap();
  assert_eq!(coordinates(&global), *points);
}

#[test]
fn topology_cache_reuses_body_edits_but_separates_topology_generation_and_scope() {
  let cache = graph_layout::cache();
  let mut documents = index(&[("a.md", "[B](b.md)"), ("b.md", "")], &[]);
  let original = super::graph_projection::graph(&documents, request()).unwrap();
  let first = graph_layout::positions(&cache, &documents, &original).unwrap();
  documents.revision += 1;
  documents.epoch += 1;
  let changed = index(
    &[("a.md", "# New title\nBody [B](b.md)"), ("b.md", "Body")],
    &[],
  );
  documents.files = changed.files;
  let body_edit = super::graph_projection::graph(&documents, request()).unwrap();
  let second = graph_layout::positions(&cache, &documents, &body_edit).unwrap();
  assert!(Arc::ptr_eq(&first, &second));
  documents.generation += 1;
  let reopened = graph_layout::positions(&cache, &documents, &body_edit).unwrap();
  assert!(!Arc::ptr_eq(&first, &reopened));
  documents.scope = "other-workspace".into();
  let other = graph_layout::positions(&cache, &documents, &body_edit).unwrap();
  assert!(!Arc::ptr_eq(&reopened, &other));
  let changed = index(&[("a.md", "[B](b.md) [Again](b.md)"), ("b.md", "")], &[]);
  let topology_edit = super::graph_projection::graph(&changed, request()).unwrap();
  let changed_points = graph_layout::positions(&cache, &changed, &topology_edit).unwrap();
  assert!(!Arc::ptr_eq(&first, &changed_points));
  let distance = |points: &graph_layout::Positions| {
    let a = points["file:a.md"];
    let b = points["file:b.md"];
    (a.x - b.x).hypot(a.y - b.y)
  };
  assert!(distance(&changed_points) < distance(&first));
}

#[test]
fn invalid_layout_endpoints_return_a_structured_error_without_caching_a_result() {
  let documents = index(&[("a.md", "[B](b.md)"), ("b.md", "")], &[]);
  let mut topology = super::graph_projection::graph(&documents, request()).unwrap();
  let cache = graph_layout::cache();
  topology.edges[0].target = "file:absent.md".into();
  assert_eq!(
    graph_layout::positions(&cache, &documents, &topology)
      .unwrap_err()
      .code,
    "GRAPH_LAYOUT_FAILED"
  );
  topology.edges[0].target = "file:b.md".into();
  assert_eq!(
    graph_layout::positions(&cache, &documents, &topology)
      .unwrap()
      .len(),
    2
  );
}

#[test]
#[ignore = "release-mode 10k-node layout timing; run explicitly"]
fn benchmark_ten_thousand_nodes_thirty_thousand_edges() {
  let documents = index(&[], &[]);
  let nodes = (0..10_000)
    .map(|i| GraphNode::File {
      id: format!("file:{i:05}.md"),
      label: i.to_string(),
      path: format!("{i:05}.md"),
      group: GraphGroup {
        key: "fixture".into(),
        label: "fixture".into(),
        source: GroupSource::Path,
      },
      position: GraphPosition::default(),
    })
    .collect();
  let edges = (0..10_000)
    .flat_map(|i| {
      [1, 7, 37].map(move |offset| GraphEdge {
        id: format!("edge:{i}:{offset}"),
        source: format!("file:{i:05}.md"),
        target: format!("file:{:05}.md", (i + offset) % 10_000),
        kind: EdgeKind::LinksTo,
        count: 1,
      })
    })
    .collect();
  let topology = WorkspaceGraph {
    mode: GraphMode::Relations,
    revision: "benchmark".into(),
    topology_key: "benchmark".into(),
    nodes,
    edges,
    truncated: false,
    total_nodes: 10_000,
    total_edges: 30_000,
  };
  let started = std::time::Instant::now();
  let points = graph_layout::positions(&graph_layout::cache(), &documents, &topology).unwrap();
  eprintln!("10k nodes / 30k edges: {:?}", started.elapsed());
  assert_eq!(points.len(), 10_000);
}
