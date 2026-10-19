use super::*;
use crate::{
  analysis::AnalysisService,
  workspace::{RootInfo, Workspace},
};
use std::sync::Arc;

async fn fixture_index(files: &[(&str, &str)]) -> (tempfile::TempDir, Arc<Index>) {
  let directory = tempfile::tempdir().unwrap();
  for (path, content) in files {
    tokio::fs::write(directory.path().join(path), content)
      .await
      .unwrap();
  }
  let workspace = Arc::new(Workspace::new(
    RootInfo {
      kind: "external".into(),
      path: directory
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned(),
    },
    100,
  ));
  let pool = sqlx::sqlite::SqlitePoolOptions::new()
    .max_connections(1)
    .connect("sqlite::memory:")
    .await
    .unwrap();
  let analysis = AnalysisService::new(pool);
  (directory, analysis.index(workspace).await.unwrap())
}

fn request(content: &str) -> MarkdownRequest {
  MarkdownRequest {
    path: Some("current.md".into()),
    content: content.into(),
    line: 1,
    column: 3,
    new_name: Some("Final Draft".into()),
  }
}

#[tokio::test]
async fn heading_rename_rewrites_destinations_without_rewriting_identical_labels_or_reference_usages()
 {
  let content = "# Old\n\n[current.md#old](current.md#old)\n";
  let external = "😀 [current.md#old](current.md#old \"title\") and [[current#old|current#old]]\r\n\r\n[Go][ref]\r\n\r\n[ref]: current.md#old\r\n";
  let (_directory, index) = fixture_index(&[("current.md", content), ("other.md", external)]).await;
  let plan = prepare(&index, &request(content)).unwrap();
  let edit = &plan.external[0];
  assert_eq!(edit.path, "other.md");
  assert_eq!(
    edit.after,
    "😀 [current.md#old](current.md#final-draft \"title\") and [[current#final-draft|current#old]]\r\n\r\n[Go][ref]\r\n\r\n[ref]: current.md#old\r\n"
  );
  assert_eq!(edit.edit_count, 2);
  assert_eq!(plan.result["edits"][1]["startColumn"], 18);
  assert_eq!(plan.result["edits"][1]["newText"], "current.md#final-draft");
}

#[tokio::test]
async fn heading_rename_skips_decoded_destination_even_if_its_literal_appears_in_a_title() {
  let content = "# Old\n";
  let external = "[current.md#old](current.md#o&#108;d \"current.md#old\")\n";
  let (_directory, index) = fixture_index(&[("current.md", content), ("other.md", external)]).await;
  let link = &index.files["other.md"].links[0];
  assert_eq!(link.target, "current.md#old");
  assert_eq!(link.offset, link.end_offset);
  let plan = prepare(&index, &request(content)).unwrap();
  assert!(plan.external.is_empty());
}

#[tokio::test]
async fn heading_rename_keeps_the_atx_marker_for_empty_headings() {
  let content = "# #\n";
  let (_directory, index) = fixture_index(&[("current.md", content)]).await;
  let plan = prepare(&index, &request(content)).unwrap();
  assert_eq!(plan.result["edits"][0]["startColumn"], 3);
  assert_eq!(plan.result["edits"][0]["endColumn"], 4);
  assert_eq!(plan.result["edits"][0]["newText"], "Final Draft");
  let (_directory, index) = fixture_index(&[("current.md", "###\n")]).await;
  let plan = prepare(&index, &request("###\n")).unwrap();
  assert_eq!(plan.result["edits"][0]["startColumn"], 4);
  assert_eq!(plan.result["edits"][0]["endColumn"], 4);
  assert_eq!(plan.result["edits"][0]["newText"], " Final Draft");
}

#[tokio::test]
async fn extensionless_markdown_definitions_resolve_existing_markdown_files() {
  let content = "[Go](current#old)\n";
  let (_directory, index) =
    fixture_index(&[("current.md", "# Old\n"), ("other.md", content)]).await;
  let request = MarkdownRequest {
    path: Some("other.md".into()),
    content: content.into(),
    line: 1,
    column: 10,
    new_name: None,
  };
  let definition = crate::language::markdown::definition(&index, &request);
  assert_eq!(definition["path"], "current.md");
  assert_eq!(definition["headingSlug"], "old");
}

#[tokio::test]
async fn external_edit_after_rename_validation_is_preserved_by_save_cas() {
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("other.md");
  tokio::fs::write(&path, "[Go](current.md#old)")
    .await
    .unwrap();
  let workspace = Workspace::new(
    RootInfo {
      kind: "external".into(),
      path: directory
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned(),
    },
    101,
  );
  let edits = vec![External {
    path: "other.md".into(),
    before: "[Go](current.md#old)".into(),
    after: "[Go](current.md#new)".into(),
    edit_count: 1,
  }];
  let _mutation = workspace.mutation.lock().await;
  validate_external(&workspace, &edits).await.unwrap();
  tokio::fs::write(&path, "external edit").await.unwrap();
  let statuses = apply_external(&workspace, edits).await.unwrap();
  assert_eq!(statuses.len(), 1);
  assert!(statuses[0].dirty);
  assert_eq!(statuses[0].session_generation, 101);
  assert_eq!(
    workspace.flush_buffers_under_lock().await.unwrap_err().code,
    "FILE_CONFLICT"
  );
  assert_eq!(
    tokio::fs::read_to_string(path).await.unwrap(),
    "external edit"
  );
  assert_eq!(
    workspace.read_file("other.md").await.unwrap(),
    "[Go](current.md#new)"
  );
  assert!(
    workspace
      .buffer_status("other.md")
      .await
      .unwrap()
      .unwrap()
      .dirty
  );
}

#[tokio::test]
async fn changed_source_rejects_external_edits_while_synchronized_unsaved_drafts_can_rename() {
  let initial = "# Old\n";
  let reference = "[Go](current.md#old)";
  let (directory, index) = fixture_index(&[("current.md", initial), ("other.md", reference)]).await;
  let registry =
    crate::workspace::WorkspaceRegistry::new(&directory.path().join("profile")).unwrap();
  let workspace = registry
    .open_async("main", Some(directory.path().to_str().unwrap()), false)
    .await
    .unwrap();
  let other = registry
    .open_async("second", Some(directory.path().to_str().unwrap()), false)
    .await
    .unwrap();
  let plan = prepare(&index, &request(initial)).unwrap();
  other
    .write_file("current.md", "# Changed by another window\n")
    .await
    .unwrap();
  let rejected = async {
    let _mutation = registry.lock_binding("main", &workspace).await?;
    validate_source(&workspace, plan.source.as_ref()).await?;
    validate_external(&workspace, &plan.external).await?;
    apply_external(&workspace, plan.external).await?;
    Ok::<_, BackendError>(())
  }
  .await;
  assert_eq!(rejected.unwrap_err().code, "EDIT_CONFLICT");
  assert!(workspace.buffer_status("other.md").await.unwrap().is_none());
  assert_eq!(
    tokio::fs::read_to_string(directory.path().join("other.md"))
      .await
      .unwrap(),
    reference
  );
  assert_eq!(
    other.read_file("current.md").await.unwrap(),
    "# Changed by another window\n"
  );

  // flushEditorChanges synchronizes the frontend draft into this buffer; it
  // does not need to force a disk save before the rename command can proceed.
  let draft = "# Old\n\nUnsaved draft";
  workspace.write_file("current.md", draft).await.unwrap();
  let request = request(draft);
  let overlay = crate::language::markdown::overlay(&index, &request).unwrap();
  let plan = prepare(&overlay, &request).unwrap();
  let _mutation = registry.lock_binding("main", &workspace).await.unwrap();
  validate_source(&workspace, plan.source.as_ref())
    .await
    .unwrap();
  validate_external(&workspace, &plan.external).await.unwrap();
  apply_external(&workspace, plan.external).await.unwrap();
  assert_eq!(workspace.read_file("current.md").await.unwrap(), draft);
  assert_eq!(
    workspace.read_file("other.md").await.unwrap(),
    "[Go](current.md#final-draft)"
  );
  assert_eq!(
    tokio::fs::read_to_string(directory.path().join("current.md"))
      .await
      .unwrap(),
    initial
  );
}
