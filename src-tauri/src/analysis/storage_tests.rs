#[tokio::test]
async fn disk_cleanup_removes_expired_oversized_and_excess_workspace_caches() {
    let (_directory, _workspace, service) = super::tests::fixture().await;
    service.ensure_schema().await.expect("schema");
    let now = chrono::Utc::now().timestamp_millis();
    for index in 0..34 {
        sqlx::query("INSERT INTO analysis_cache_workspaces(scope,fingerprint,last_access,bytes)VALUES(?,'fingerprint',?,0)").bind(format!("workspace-{index:02}")).bind(now+index).execute(&service.pool).await.expect("cache scope");
    }
    sqlx::query("UPDATE analysis_cache_workspaces SET last_access=0 WHERE scope='workspace-33'")
        .execute(&service.pool)
        .await
        .expect("expire newest scope");
    sqlx::query("UPDATE analysis_cache_workspaces SET bytes=? WHERE scope='workspace-32'")
        .bind(128 * 1024 * 1024 + 1)
        .execute(&service.pool)
        .await
        .expect("oversized scope");
    service.prune_disk().await.expect("maintenance");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM analysis_cache_workspaces")
        .fetch_one(&service.pool)
        .await
        .expect("bounded rows");
    assert_eq!(count, 32);
    let remaining:i64=sqlx::query_scalar("SELECT COUNT(*) FROM analysis_cache_workspaces WHERE scope IN ('workspace-32','workspace-33')").fetch_one(&service.pool).await.expect("pruned invalid scopes");
    assert_eq!(remaining, 0);
}

#[tokio::test]
async fn same_count_fts_corruption_falls_back_to_source_and_rebuilds() {
    let (directory, workspace, service) = super::tests::fixture().await;
    tokio::fs::write(
        directory.path().join("target.md"),
        "# Heading\n\nalpha target",
    )
    .await
    .expect("second matching source");
    let index = service
        .index(workspace.clone())
        .await
        .expect("persist index");
    sqlx::query(
        "UPDATE analysis_fts SET content='damaged cached body' WHERE scope=? AND path='target.md'",
    )
    .bind(&index.scope)
    .execute(&service.pool)
    .await
    .expect("damage one FTS row");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM analysis_fts WHERE scope=?")
        .bind(&index.scope)
        .fetch_one(&service.pool)
        .await
        .expect("unchanged row count");
    assert_eq!(count, index.files.len() as i64);
    assert!(!service.persisted_index_matches(&index).await);
    let results = service
        .search(
            workspace.clone(),
            super::search::SearchRequest {
                query: "alpha".into(),
                limit: Some(20),
            },
        )
        .await
        .expect("source fallback");
    assert_eq!(
        results
            .iter()
            .map(|result| result.path.as_str())
            .collect::<Vec<_>>(),
        ["start.md", "target.md"]
    );

    service.invalidate(workspace.generation).await;
    let rebuilt = service
        .index(workspace)
        .await
        .expect("repair disposable FTS");
    assert!(service.persisted_index_matches(&rebuilt).await);
    let content: String =
        sqlx::query_scalar("SELECT content FROM analysis_fts WHERE scope=? AND path='target.md'")
            .bind(&rebuilt.scope)
            .fetch_one(&service.pool)
            .await
            .expect("repaired body");
    assert_eq!(content, "# Heading\n\nalpha target");
}
