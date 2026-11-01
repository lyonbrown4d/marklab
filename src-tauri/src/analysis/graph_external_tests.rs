use super::{
  graph_tests::{ids, index, project_graph, request},
  graph_types::{EdgeKind, GraphDirection, GraphNode},
};
use std::collections::{BTreeMap, BTreeSet};

#[test]
fn filters_control_attachments_missing_targets_without_hiding_websites() {
  let index = index(
    &[(
      "a.md",
      "![Cover](cover.png) ![Missing](missing.png) [PDF](absent.pdf) [Page](missing.md) [[MissingWiki]] [Web](https://example.com) [Escape](../secret.md)",
    )],
    &["cover.png"],
  );
  let mut query = request();
  assert_eq!(project_graph(&index, query.clone()).unwrap().total_nodes, 7);
  query.include_attachments = false;
  let value = project_graph(&index, query.clone()).unwrap();
  assert_eq!(
    ids(&value),
    BTreeSet::from([
      "file:a.md",
      "missing:missing.md",
      "missing:MissingWiki.md",
      "external:https://example.com/",
    ])
  );
  query.include_missing = false;
  query.include_attachments = true;
  assert_eq!(
    ids(&project_graph(&index, query).unwrap()),
    BTreeSet::from([
      "file:a.md",
      "preview:cover.png",
      "external:https://example.com/"
    ])
  );
}

#[test]
fn website_links_keep_labels_normalize_urls_and_count_repeated_relations() {
  let index = index(
    &[
      (
        "a.md",
        "[规范说明](HTTPS://EXAMPLE.COM:443/guide?q=1#section) [Again](https://example.com/guide?q=1#section) [Other section](https://example.com/guide?q=1#other) [Other query](https://example.com/guide?q=2#section)",
      ),
      ("b.md", "[Same site](https://example.com/guide?q=1#section)"),
    ],
    &[],
  );
  let mut query = request();
  query.include_attachments = false;
  query.include_missing = false;
  let graph = project_graph(&index, query).unwrap();
  let websites: BTreeMap<_, _> = graph
    .nodes
    .iter()
    .filter_map(|node| match node {
      GraphNode::External { id, label, url } => {
        assert_eq!(id, &format!("external:{url}"));
        Some((url.as_str(), label.as_str()))
      }
      _ => None,
    })
    .collect();
  assert_eq!(websites.len(), 3);
  assert_eq!(
    websites["https://example.com/guide?q=1#section"],
    "规范说明"
  );
  assert_eq!((graph.total_nodes, graph.total_edges), (5, 4));
  let edge = graph
    .edges
    .iter()
    .find(|edge| {
      edge.source == "file:a.md" && edge.target == "external:https://example.com/guide?q=1#section"
    })
    .unwrap();
  assert_eq!(edge.kind, EdgeKind::LinksTo);
  assert_eq!(edge.count, 2);
  let wire = serde_json::to_value(graph).unwrap();
  let external = wire["nodes"]
    .as_array()
    .unwrap()
    .iter()
    .find(|node| node["kind"] == "external")
    .unwrap();
  assert!(external.get("url").is_some());
  assert!(external.get("path").is_none());
  assert!(external.get("source_path").is_none());
  assert!(external.get("position").is_none());
}

#[test]
fn website_labels_fall_back_to_hostnames_and_body_edits_preserve_topology() {
  let original = index(
    &[(
      "a.md",
      "[](http://example.com/path) <https://other.example/path> [RFC: 说明](https://docs.example/) ",
    )],
    &[],
  );
  let graph = project_graph(&original, request()).unwrap();
  let labels: BTreeMap<_, _> = graph
    .nodes
    .iter()
    .filter_map(|node| match node {
      GraphNode::External { url, label, .. } => Some((url.as_str(), label.as_str())),
      _ => None,
    })
    .collect();
  assert_eq!(labels["http://example.com/path"], "example.com");
  assert_eq!(labels["https://other.example/path"], "other.example");
  assert_eq!(labels["https://docs.example/"], "RFC: 说明");
  let edited = index(
    &[(
      "a.md",
      "# Updated\nBody [](http://example.com/path) <https://other.example/path> [新说明](https://docs.example/)",
    )],
    &[],
  );
  assert_eq!(
    graph.topology_key,
    project_graph(&edited, request()).unwrap().topology_key
  );
}

#[test]
fn only_safe_absolute_webpage_links_become_external_nodes() {
  let index = index(
    &[(
      "a.md",
      "[Web](https://safe.example/) [Mail](mailto:user@example.com) [Script](javascript:alert%281%29) [File](file:///tmp/example) [FTP](ftp://example.com/file) [User](https://name@example.com/) [Password](https://:secret@example.com/) [Invalid](https://) [Relative](//example.com/path) ![Remote image](https://images.example/image.png) [[https://wiki.example/]]",
    )],
    &[],
  );
  let graph = project_graph(&index, request()).unwrap();
  assert_eq!(
    graph
      .nodes
      .iter()
      .map(|node| node.id())
      .collect::<BTreeSet<_>>(),
    BTreeSet::from(["file:a.md", "external:https://safe.example/"])
  );
  assert_eq!(graph.edges.len(), 1);
}

#[test]
fn local_graph_depth_direction_and_budgets_include_websites_as_bounded_neighbors() {
  let index = index(
    &[
      ("a.md", "[B](b.md) [Direct](https://direct.example/)"),
      ("b.md", "[Two hops](https://neighbor.example/)"),
      ("orphan.md", "[Unrelated](https://unrelated.example/)"),
    ],
    &[],
  );
  let mut query = request();
  query.center_path = Some("a.md".into());
  query.direction = GraphDirection::Outgoing;
  query.include_attachments = false;
  query.include_missing = false;
  let one_hop = project_graph(&index, query.clone()).unwrap();
  assert_eq!(
    one_hop
      .nodes
      .iter()
      .map(|node| node.id())
      .collect::<BTreeSet<_>>(),
    BTreeSet::from(["file:a.md", "file:b.md", "external:https://direct.example/"])
  );
  query.depth = 2;
  let two_hops = project_graph(&index, query.clone()).unwrap();
  assert_eq!(two_hops.total_nodes, 4);
  assert!(
    two_hops
      .nodes
      .iter()
      .any(|node| node.id() == "external:https://neighbor.example/")
  );
  query.direction = GraphDirection::Incoming;
  assert_eq!(project_graph(&index, query.clone()).unwrap().total_nodes, 1);
  query.direction = GraphDirection::Outgoing;
  query.max_nodes = 2;
  query.max_edges = 1;
  let limited = project_graph(&index, query).unwrap();
  assert_eq!((limited.total_nodes, limited.total_edges), (4, 3));
  assert!(limited.truncated);
  assert_eq!(limited.nodes.len(), 2);
  assert_eq!(limited.edges.len(), 1);
  assert!(limited.edges.iter().all(
    |edge| limited.nodes.iter().any(|node| node.id() == edge.source)
      && limited.nodes.iter().any(|node| node.id() == edge.target)
  ));
  let mut global_query = request();
  global_query.max_nodes = 1;
  let global = project_graph(&index, global_query).unwrap();
  assert_eq!((global.total_nodes, global.total_edges), (6, 4));
  assert_eq!(global.nodes.len(), 1);
  assert_eq!(global.nodes[0].id(), "file:a.md");
  assert!(global.edges.is_empty());
  assert!(global.truncated);
}
