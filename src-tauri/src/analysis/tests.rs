use super::{AnalysisService, document, graph, queries, search};
use crate::workspace::{RootInfo, Workspace};
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::{Arc, atomic::AtomicBool};

#[test]
fn markdown_index_preserves_headings_wiki_targets_and_utf16_positions() {
  let file=document::parse("folder/start.md".into(),"# 标题\n\n## Same\n## Same\n\n😀 [Other](other.md#target) and [[Wiki page|Label]]\n\n`[[ignored]]`\n\n```md\n[[also ignored]]\n```".into()).expect("parse");
  assert_eq!(
    file
      .headings
      .iter()
      .map(|heading| heading.slug.as_str())
      .collect::<Vec<_>>(),
    vec!["标题", "same", "same-1"]
  );
  assert_eq!(file.links.len(), 2);
  assert_eq!(file.links[0].target, "other.md#target");
  assert_eq!(file.links[0].line, 6);
  assert_eq!(file.links[0].column, 12);
  assert_eq!(file.links[1].target, "Wiki page");
  assert_eq!(file.links[1].text, "Label");
}

pub(super) async fn fixture() -> (tempfile::TempDir, Arc<Workspace>, AnalysisService) {
  let directory = tempfile::tempdir().expect("workspace");
  tokio::fs::write(
    directory.path().join("start.md"),
    "# Start\n\n😀 alpha alpha\n\n[Target](target.md#heading)\n\n![Missing](missing.png)",
  )
  .await
  .expect("source");
  tokio::fs::write(
    directory.path().join("target.md"),
    "# Heading\n\nTarget content",
  )
  .await
  .expect("target");
  tokio::fs::write(directory.path().join("orphan.md"), "# Orphan")
    .await
    .expect("orphan");
  let workspace = Arc::new(Workspace::new(
    RootInfo {
      kind: crate::workspace::RootKind::External,
      path: directory
        .path()
        .canonicalize()
        .expect("canonical fixture root")
        .to_string_lossy()
        .into_owned(),
    },
    1,
  ));
  let pool = SqlitePoolOptions::new()
    .max_connections(1)
    .connect("sqlite::memory:")
    .await
    .expect("SQLite");
  (directory, workspace, AnalysisService::new(pool))
}

#[tokio::test]
async fn analysis_queries_share_real_index_and_invalidate_on_dirty_buffer_changes() {
  let (_directory, workspace, service) = fixture().await;
  let first = service.index(workspace.clone()).await.expect("index");
  let summary = queries::summary(&first);
  assert_eq!(summary.file_count, 3);
  assert_eq!(summary.linked_file_count, 2);
  assert_eq!(summary.orphan_file_count, 1);
  let insights = queries::insights(
    &first,
    queries::InsightsRequest {
      path: "target.md".into(),
      asset_limit: Some(10),
    },
  )
  .expect("insights");
  assert_eq!(insights.knowledge.incoming_count, 1);
  assert_eq!(insights.backlinks[0].source_path, "start.md");
  assert_eq!(insights.asset_report.workspace_missing_count, 1);
  let topology = graph::graph(&first);
  assert!(
    topology
      .nodes
      .iter()
      .any(|node| matches!(node, super::graph::GraphNode::File {id, ..} if id == "file:target.md"))
  );
  workspace
    .write_file("target.md", "# Updated heading")
    .await
    .expect("dirty update");
  let second = service.index(workspace).await.expect("updated index");
  assert!(second.revision > first.revision);
  assert_eq!(second.files["target.md"].title, "Updated heading");
  assert_eq!(queries::summary(&second).missing_link_count, 1);
  assert!(
    graph::details(
      &second,
      graph::DetailsRequest {
        revision: graph::revision(&first),
        node_ids: vec!["file:target.md".into()],
        mode: "summary".into(),
        max_nodes: None
      }
    )
    .is_err()
  );
}

#[tokio::test]
async fn sqlite_search_and_cancellable_occurrences_preserve_match_coordinates() {
  let (_directory, workspace, service) = fixture().await;
  let results = service
    .search(
      workspace.clone(),
      search::SearchRequest {
        query: "alpha".into(),
        limit: Some(20),
      },
    )
    .await
    .expect("FTS search");
  assert_eq!(results.len(), 1);
  assert_eq!(results[0].path, "start.md");
  assert_eq!(
    (results[0].line, results[0].column, results[0].end_column),
    (3, 4, 9)
  );
  let request = search::OccurrenceRequest {
    request_id: "search-1".into(),
    query: "alpha".into(),
    limit: Some(1),
    options: search::OccurrenceOptions {
      case_sensitive: false,
      whole_word: true,
      use_regex: false,
    },
  };
  let index = service.index(workspace).await.expect("index");
  let matches =
    search::scan(&index, request.clone(), &AtomicBool::new(false)).expect("occurrences");
  assert_eq!(matches.total_hits, 2);
  assert_eq!(matches.results.len(), 1);
  assert!(matches.truncated);
  let cancelled = search::scan(&index, request, &AtomicBool::new(true)).expect("cancelled");
  assert_eq!(cancelled.scanned_documents, 0);
  assert!(cancelled.truncated);
  assert!(!service.cancel_occurrence("other-window", "search-1").await);
}

#[test]
fn parser_preserves_nested_image_links_and_split_wiki_text_in_source_order() {
  let document = document::parse(
    "a.md".into(),
    "[[First]] then [![cover](image.png)](target.md) and [[Last|Label]]".into(),
  )
  .unwrap();
  assert_eq!(
    document
      .links
      .iter()
      .map(|link| link.target.as_str())
      .collect::<Vec<_>>(),
    vec!["First", "target.md", "Last"]
  );
  assert_eq!(document.assets.len(), 1);
  assert_eq!(document.assets[0].target, "image.png");
  assert_eq!(document.links[1].text, "cover");
}

#[tokio::test]
async fn typed_analysis_projections_preserve_the_frontend_wire_contract() {
  let (_directory, workspace, service) = fixture().await;
  let index = service.index(workspace).await.expect("index");
  let pages = serde_json::to_value(
    queries::pages(
      &index,
      queries::PageRequest {
        sort: Some("path".into()),
        offset: Some(1),
        limit: Some(1),
        ..Default::default()
      },
    )
    .expect("pages"),
  )
  .expect("wire pages");
  assert_eq!(pages["ready"], true);
  assert_eq!(
    pages["items"][0],
    serde_json::json!({"path":"start.md","title":"Start","folder":"","heading_count":1,"link_count":1,"asset_count":1,"issue_count":1})
  );
  assert_eq!(
    (
      pages["total"].as_u64(),
      pages["offset"].as_u64(),
      pages["limit"].as_u64()
    ),
    (Some(3), Some(1), Some(1))
  );
  let navigation = serde_json::to_value(
    queries::navigation(
      &index,
      queries::NavigationRequest {
        active_path: Some("start.md".into()),
        ..Default::default()
      },
    )
    .expect("navigation"),
  )
  .expect("wire navigation");
  assert_eq!(
    navigation["current"]["outgoing_links"][0]["target_path"],
    "target.md"
  );
  assert_eq!(navigation["current"]["outgoing_link_total"], 1);
  let insights = serde_json::to_value(
    queries::insights(
      &index,
      queries::InsightsRequest {
        path: "start.md".into(),
        asset_limit: Some(1),
      },
    )
    .expect("insights"),
  )
  .expect("wire insights");
  assert_eq!(
    insights["asset_report"]["current_assets"][0]["status"],
    "missing"
  );
  assert_eq!(insights["knowledge"]["outgoing"][0]["path"], "target.md");
  let summary = serde_json::to_value(queries::summary(&index)).expect("wire summary");
  assert_eq!(summary["collection_counts"]["needs-attention"], 1);
  let plan = serde_json::to_value(graph::publication(&index)).expect("wire publication");
  assert_eq!(plan["orphanCount"], 2);
  assert_eq!(
    plan["chapters"][0]["wordCount"],
    index.files["orphan.md"].word_count
  );
  assert!(plan["chapters"][0].get("word_count").is_none());
  let status = serde_json::to_value(service.status().await).expect("wire status");
  assert_eq!(
    status,
    serde_json::json!({"state":"ready","binaryPath":null})
  );
  let workspaces = serde_json::to_value(service.workspaces().await).expect("wire workspaces");
  assert_eq!(workspaces[0]["spawnPlan"]["mode"], "rust-embedded");
  assert_eq!(workspaces[0]["identity"]["canonicalRoot"], index.root);
  let state = serde_json::to_value(
    service
      .workspace_status(&index.scope)
      .await
      .expect("workspace status"),
  )
  .expect("wire workspace status");
  assert_eq!(state["index"]["searchIndex"], "sqlite-fts5");
  assert_eq!(state["health"]["metadataDocuments"], "3");
}
