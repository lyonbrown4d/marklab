use super::graph_types::{GraphDirection, GraphNode, WorkspaceGraphRequest};
use super::{Index, document, graph, targets};
use std::{
  collections::{BTreeMap, BTreeSet},
  sync::Arc,
};

pub(super) fn request() -> WorkspaceGraphRequest {
  WorkspaceGraphRequest {
    center_path: None,
    depth: 1,
    direction: GraphDirection::Both,
    include_attachments: true,
    include_missing: true,
    max_nodes: 100,
    max_edges: 200,
  }
}

pub(super) fn index(files: &[(&str, &str)], assets: &[&str]) -> Index {
  let mut files: BTreeMap<_, _> = files
    .iter()
    .map(|(path, text)| {
      (
        (*path).into(),
        Arc::new(document::parse((*path).into(), (*text).into()).unwrap()),
      )
    })
    .collect();
  let paths = files
    .keys()
    .cloned()
    .chain(assets.iter().map(|path| (*path).into()))
    .collect();
  targets::resolve_documents(&mut files, &paths);
  Index {
    revision: 1,
    generation: 1,
    scope: "test".into(),
    root: "test".into(),
    opened_at: 0,
    indexed_at: 0,
    files,
    paths,
    epoch: 1,
    fingerprint: "test".into(),
  }
}

pub(super) fn project_graph(
  index: &Index,
  request: WorkspaceGraphRequest,
) -> crate::error::BackendResult<graph::WorkspaceGraph> {
  graph::graph(index, request, &super::graph_layout::cache())
}

fn ids(value: &graph::WorkspaceGraph) -> BTreeSet<&str> {
  value
    .nodes
    .iter()
    .map(|node| match node {
      GraphNode::File { id, .. }
      | GraphNode::Preview { id, .. }
      | GraphNode::Missing { id, .. } => id.as_str(),
    })
    .collect()
}

#[test]
fn directed_relations_preserve_reciprocal_links_reference_kinds_and_occurrence_counts() {
  let index = index(
    &[
      (
        "a.md",
        "[B](b.md) [B](b.md) [Heading](b.md#target) [Broken](b.md#absent) [Self](#absent)",
      ),
      ("b.md", "# Target\n[A](a.md)"),
    ],
    &[],
  );
  assert_eq!(project_graph(&index, request()).unwrap().total_nodes, 2);
  let mut query = request();
  query.include_missing = false;
  let value = project_graph(&index, query).unwrap();
  let counts: BTreeMap<_, _> = value
    .edges
    .iter()
    .map(|edge| {
      (
        (
          edge.source.as_str(),
          edge.target.as_str(),
          format!("{:?}", edge.kind),
        ),
        edge.count,
      )
    })
    .collect();
  assert_eq!(
    counts.get(&("file:a.md", "file:b.md", "LinksTo".into())),
    Some(&2)
  );
  assert_eq!(
    counts.get(&("file:a.md", "file:b.md", "ReferencesHeading".into())),
    Some(&2)
  );
  assert_eq!(
    counts.get(&("file:b.md", "file:a.md", "LinksTo".into())),
    Some(&1)
  );
  assert_eq!(value.total_edges, 3);
  assert!(!value.truncated);
}

#[test]
fn delimiter_substrings_in_workspace_paths_cannot_collide_relation_ids() {
  let index = index(
    &[
      ("a.md:links_to:file:b.md", "[Target](dir/c.md)"),
      ("a.md", "[[c]]"),
      ("b.md:links_to:file:dir/c.md", "# C"),
      ("dir/c.md", "# Other C"),
    ],
    &[],
  );
  let value = project_graph(&index, request()).unwrap();
  assert_eq!(value.edges.len(), 2);
  assert_eq!(
    value
      .edges
      .iter()
      .map(|edge| &edge.id)
      .collect::<BTreeSet<_>>()
      .len(),
    2
  );
}

#[test]
fn local_depth_and_direction_select_only_reachable_neighbors() {
  let index = index(
    &[
      ("a.md", "[B](b.md)"),
      ("b.md", "[D](d.md)"),
      ("c.md", "[A](a.md) [E](e.md)"),
      ("d.md", ""),
      ("e.md", ""),
    ],
    &[],
  );
  let mut query = request();
  query.center_path = Some("a.md".into());
  query.direction = GraphDirection::Incoming;
  assert_eq!(
    ids(&project_graph(&index, query.clone()).unwrap()),
    BTreeSet::from(["file:a.md", "file:c.md"])
  );
  query.direction = GraphDirection::Outgoing;
  assert_eq!(
    ids(&project_graph(&index, query.clone()).unwrap()),
    BTreeSet::from(["file:a.md", "file:b.md"])
  );
  query.depth = 2;
  assert_eq!(
    ids(&project_graph(&index, query.clone()).unwrap()),
    BTreeSet::from(["file:a.md", "file:b.md", "file:d.md"])
  );
  query.depth = 1;
  query.direction = GraphDirection::Both;
  assert_eq!(
    ids(&project_graph(&index, query).unwrap()),
    BTreeSet::from(["file:a.md", "file:b.md", "file:c.md"])
  );
}

#[test]
fn truncation_keeps_center_and_edge_endpoints_and_reports_eligible_scope_totals() {
  let index = index(
    &[
      ("z.md", "[A](a.md) [B](b.md) [C](c.md)"),
      ("a.md", ""),
      ("b.md", ""),
      ("c.md", ""),
    ],
    &[],
  );
  let mut query = request();
  query.center_path = Some("z.md".into());
  query.max_nodes = 2;
  query.max_edges = 1;
  let value = project_graph(&index, query).unwrap();
  assert_eq!((value.total_nodes, value.total_edges), (4, 3));
  assert_eq!(ids(&value), BTreeSet::from(["file:z.md", "file:a.md"]));
  assert!(value.truncated);
  assert_eq!(value.edges.len(), 1);
  assert!(
    value
      .edges
      .iter()
      .all(|edge| ids(&value).contains(edge.source.as_str())
        && ids(&value).contains(edge.target.as_str()))
  );
}

#[test]
fn filters_control_attachments_missing_targets_and_exclude_external_unsafe_paths() {
  let index = index(
    &[(
      "a.md",
      "![Cover](cover.png) ![Missing](missing.png) [PDF](absent.pdf) [Page](missing.md) [[MissingWiki]] [Web](https://example.com) [Escape](../secret.md)",
    )],
    &["cover.png"],
  );
  let mut query = request();
  assert_eq!(project_graph(&index, query.clone()).unwrap().total_nodes, 6);
  query.include_attachments = false;
  let value = project_graph(&index, query.clone()).unwrap();
  assert_eq!(
    ids(&value),
    BTreeSet::from(["file:a.md", "missing:missing.md", "missing:MissingWiki.md"])
  );
  query.include_missing = false;
  query.include_attachments = true;
  assert_eq!(
    ids(&project_graph(&index, query).unwrap()),
    BTreeSet::from(["file:a.md", "preview:cover.png"])
  );
}

#[test]
fn topology_identity_changes_only_with_visible_relations_and_counts() {
  let first = index(&[("a.md", "# Original\n[B](b.md)"), ("b.md", "Body")], &[]);
  let mut changed = index(
    &[
      ("a.md", "# Revised\nUpdated prose. [B](b.md)"),
      ("b.md", "New body"),
    ],
    &[],
  );
  changed.revision = 9;
  let before = project_graph(&first, request()).unwrap();
  let after = project_graph(&changed, request()).unwrap();
  assert_ne!(before.revision, after.revision);
  assert_eq!(before.topology_key, after.topology_key);
  let repeated = index(&[("a.md", "[B](b.md) [Again](b.md)"), ("b.md", "")], &[]);
  assert_ne!(
    before.topology_key,
    project_graph(&repeated, request()).unwrap().topology_key
  );
}

#[test]
fn query_rejects_unsafe_paths_invalid_budgets_unknown_fields_and_missing_centers() {
  let index = index(&[("a.md", "")], &[]);
  for path in [
    "../a.md", "/a.md", "C:/a.md", "a\\b.md", "a/./b.md", "a//b.md", "a.md\0",
  ] {
    let mut query = request();
    query.center_path = Some(path.into());
    assert_eq!(
      project_graph(&index, query).unwrap_err().code,
      "INVALID_REQUEST"
    );
  }
  let mut query = request();
  query.max_nodes = 0;
  assert_eq!(
    project_graph(&index, query).unwrap_err().code,
    "INVALID_REQUEST"
  );
  let mut query = request();
  query.depth = 3;
  assert_eq!(
    project_graph(&index, query).unwrap_err().code,
    "INVALID_REQUEST"
  );
  let mut query = request();
  query.center_path = Some("unknown.md".into());
  assert_eq!(project_graph(&index, query).unwrap_err().code, "NOT_FOUND");
  let mut wire = serde_json::to_value(request()).unwrap();
  wire["legacy"] = true.into();
  assert!(serde_json::from_value::<WorkspaceGraphRequest>(wire).is_err());
  let mut wire = serde_json::to_value(request()).unwrap();
  wire.as_object_mut().unwrap().remove("center_path");
  assert!(serde_json::from_value::<WorkspaceGraphRequest>(wire).is_err());
}

#[tokio::test]
async fn request_keyed_projection_cache_does_not_reuse_other_graph_scopes() {
  let (_directory, workspace, service) = super::tests::fixture().await;
  let index = service.index(workspace).await.unwrap();
  let global = service
    .project_cached(index.clone(), "graph", request(), project_graph)
    .await
    .unwrap();
  let mut query = request();
  query.center_path = Some("orphan.md".into());
  let local = service
    .project_cached(index, "graph", query, project_graph)
    .await
    .unwrap();
  assert_eq!(local.total_nodes, 1);
  assert_eq!(local.total_edges, 0);
  assert!(global.total_nodes > local.total_nodes);
  assert!(!Arc::ptr_eq(&global, &local));
}
