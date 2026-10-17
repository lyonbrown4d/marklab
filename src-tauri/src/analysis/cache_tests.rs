use super::{AnalysisService, tests::fixture};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
#[tokio::test]
async fn simultaneous_index_and_projection_requests_share_real_work() {
    let (_directory, workspace, service) = fixture().await;
    let indexes =
        futures_util::future::join_all((0..8).map(|_| service.index(workspace.clone()))).await;
    let first = indexes[0].as_ref().expect("index");
    assert!(
        indexes
            .iter()
            .all(|index| Arc::ptr_eq(first, index.as_ref().expect("shared index")))
    );
    let calls = Arc::new(AtomicUsize::new(0));
    let results = futures_util::future::join_all((0..8).map(|_| {
        let calls = calls.clone();
        service.project_cached(first.clone(), "summary", (), move |index, ()| {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(serde_json::json!({"files":index.files.len()}))
        })
    }))
    .await;
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let first = results[0].as_ref().expect("projection");
    assert!(
        results
            .iter()
            .all(|result| Arc::ptr_eq(first, result.as_ref().expect("same cached projection")))
    );
}
#[tokio::test]
async fn same_length_same_timestamp_source_changes_do_not_reuse_old_analysis() {
    let (directory, workspace, service) = fixture().await;
    let first = service.index(workspace.clone()).await.expect("first index");
    let path = directory.path().join("target.md");
    let modified = std::fs::metadata(&path)
        .expect("metadata")
        .modified()
        .expect("timestamp");
    tokio::fs::write(&path, "# Revised\n\nTarget content")
        .await
        .expect("replace same length");
    std::fs::File::options()
        .write(true)
        .open(&path)
        .expect("source")
        .set_times(std::fs::FileTimes::new().set_modified(modified))
        .expect("restore timestamp");
    workspace.next_revision();
    let next = service.index(workspace).await.expect("changed index");
    assert_eq!(
        first.files["target.md"].content.len(),
        next.files["target.md"].content.len()
    );
    assert_eq!(next.files["target.md"].title, "Revised");
    assert_ne!(first.fingerprint, next.fingerprint);
}
#[tokio::test]
async fn persisted_ast_hydrates_offsets_and_corruption_falls_back_to_source() {
    use sha2::{Digest, Sha256};
    let (_directory, workspace, service) = fixture().await;
    let first = service
        .index(workspace.clone())
        .await
        .expect("persisted index");
    let hash = format!(
        "{:x}",
        Sha256::digest(first.files["start.md"].content.as_bytes())
    );
    let reopened = AnalysisService::new(service.pool.clone());
    reopened.ensure_schema().await.expect("schema");
    let archived = reopened
        .disk_document(&first.scope, "start.md", &hash)
        .await
        .expect("hydrated document");
    let original = &first.files["start.md"].links[0];
    let restored = &archived.links[0];
    assert_eq!(
        (
            original.offset,
            original.end_offset,
            original.span_start,
            original.span_end
        ),
        (
            restored.offset,
            restored.end_offset,
            restored.span_start,
            restored.span_end
        )
    );
    sqlx::query("UPDATE analysis_cache_documents SET payload='broken cache JSON' WHERE scope=? AND path='start.md'").bind(&first.scope).execute(&service.pool).await.expect("corrupt disposable cache");
    assert!(
        reopened
            .disk_document(&first.scope, "start.md", &hash)
            .await
            .is_none()
    );
    let rebuilt = reopened
        .index(workspace)
        .await
        .expect("rebuild corrupted cache");
    assert_eq!(
        rebuilt.files["start.md"].content,
        first.files["start.md"].content
    );
    assert!(reopened.persisted_index_matches(&rebuilt).await);
}
#[tokio::test]
async fn invalidated_projection_cannot_publish_as_current_after_finishing_late() {
    let (_directory, workspace, service) = fixture().await;
    let service = Arc::new(service);
    let index = service.index(workspace.clone()).await.expect("index");
    let started = Arc::new(tokio::sync::Notify::new());
    let signal = started.clone();
    let (release, wait) = std::sync::mpsc::channel();
    let worker = service.clone();
    let generation = index.generation;
    let pending = tokio::spawn(async move {
        worker
            .project_cached(index, "late", (), move |_, ()| {
                signal.notify_one();
                wait.recv().expect("release worker");
                Ok(serde_json::json!("obsolete"))
            })
            .await
    });
    started.notified().await;
    service.invalidate(generation).await;
    release.send(()).expect("finish obsolete projection");
    assert_eq!(
        pending.await.expect("task").expect_err("stale result").code,
        "INDEX_CHANGED"
    );
    let index = service.index(workspace).await.expect("new epoch");
    let current = service
        .project_cached(index, "late", (), |_, ()| Ok(serde_json::json!("current")))
        .await
        .expect("new result");
    assert_eq!(*current, serde_json::json!("current"));
}
#[tokio::test]
async fn projection_cache_enforces_entry_budget_and_expiration() {
    let (_directory, workspace, mut service) = fixture().await;
    service.queries = moka::future::Cache::builder()
        .max_capacity(2)
        .time_to_live(std::time::Duration::from_millis(15))
        .build();
    let index = service.index(workspace).await.expect("index");
    for request in 0u8..4 {
        service
            .project_cached(index.clone(), "bounded", request, |_, value| {
                Ok(serde_json::json!(value))
            })
            .await
            .expect("query");
    }
    service.queries.run_pending_tasks().await;
    assert!(service.queries.entry_count() <= 2);
    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    service.queries.run_pending_tasks().await;
    assert_eq!(service.queries.entry_count(), 0);
}

#[tokio::test]
async fn persisted_graph_reuses_topology_with_current_revision_and_rejects_changed_paths() {
    let (directory, workspace, service) = fixture().await;
    let index = service.index(workspace.clone()).await.expect("index");
    let graph = service
        .project_cached(index.clone(), "graph", (), |index, ()| {
            Ok(super::graph::graph(index))
        })
        .await
        .expect("persisted graph");
    let reopened = AnalysisService::new(service.pool.clone());
    workspace.next_revision();
    let current = reopened
        .index(workspace.clone())
        .await
        .expect("reopened index");
    assert_eq!(index.scope, current.scope);
    assert_eq!(index.fingerprint, current.fingerprint);
    let hydrated = reopened
        .project_cached(current.clone(), "graph", (), |_, ()| {
            panic!("valid graph must hydrate without recomputing")
        })
        .await
        .expect("hydrated topology");
    assert_eq!(hydrated["nodes"], graph["nodes"]);
    assert_eq!(hydrated["revision"], super::graph::revision(&current));
    assert_ne!(hydrated["revision"], graph["revision"]);
    tokio::fs::rename(
        directory.path().join("target.md"),
        directory.path().join("renamed.md"),
    )
    .await
    .expect("rename target");
    workspace.next_revision();
    let changed = reopened.index(workspace).await.expect("renamed index");
    assert_ne!(changed.fingerprint, current.fingerprint);
    assert!(reopened.disk_graph(&changed).await.is_none());
    let rebuilt = reopened
        .project_cached(changed.clone(), "graph", (), |index, ()| {
            Ok(super::graph::graph(index))
        })
        .await
        .expect("new topology");
    assert_ne!(rebuilt["nodes"], hydrated["nodes"]);
    sqlx::query("UPDATE analysis_cache_graphs SET payload='broken graph'")
        .execute(&service.pool)
        .await
        .expect("corrupt topology cache");
    assert!(reopened.disk_graph(&changed).await.is_none());
}
