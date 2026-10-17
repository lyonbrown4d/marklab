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
