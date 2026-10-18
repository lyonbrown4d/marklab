use super::*;

async fn fixture() -> (tempfile::TempDir, Arc<DiskCache>) {
    let directory = tempfile::tempdir().unwrap();
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    let cache = DiskCache::new(pool, directory.path().join("previews"))
        .await
        .unwrap();
    (directory, cache)
}
#[tokio::test]
async fn persists_independent_bytes_and_recovers_missing_or_corrupt_files() {
    let (_directory, cache) = fixture().await;
    let url = "https://example.com/";
    cache.set(url, Arc::new(vec![1, 2, 3])).await.unwrap();
    let mut bytes = cache.get(url).await.unwrap().unwrap();
    bytes[0] = 9;
    assert_eq!(cache.get(url).await.unwrap().unwrap(), [1, 2, 3]);
    tokio::fs::write(cache.file(&DiskCache::key(url)), [4])
        .await
        .unwrap();
    assert!(cache.get(url).await.unwrap().is_none());
    cache.set(url, Arc::new(vec![1, 2, 3])).await.unwrap();
    tokio::fs::remove_file(cache.file(&DiskCache::key(url)))
        .await
        .unwrap();
    assert!(cache.get(url).await.unwrap().is_none());
}
#[tokio::test]
async fn enforces_idle_expiry_byte_budget_and_reconciles_orphans() {
    let (_directory, mut cache) = fixture().await;
    Arc::get_mut(&mut cache).unwrap().max_bytes = 5;
    let first = "https://example.com/first";
    let second = "https://example.com/second";
    cache.set(first, Arc::new(vec![1, 2, 3])).await.unwrap();
    sqlx::query("UPDATE web_preview_cache SET last_access_ms=last_access_ms-1000")
        .execute(&cache.pool)
        .await
        .unwrap();
    cache.set(second, Arc::new(vec![4, 5, 6])).await.unwrap();
    assert!(cache.get(first).await.unwrap().is_none());
    assert_eq!(cache.get(second).await.unwrap().unwrap(), [4, 5, 6]);
    sqlx::query("UPDATE web_preview_cache SET last_access_ms=0")
        .execute(&cache.pool)
        .await
        .unwrap();
    cache.touch(second).await.unwrap();
    cache.maintain().await.unwrap();
    assert!(cache.get(second).await.unwrap().is_some());
    sqlx::query("UPDATE web_preview_cache SET last_access_ms=0")
        .execute(&cache.pool)
        .await
        .unwrap();
    tokio::fs::write(cache.root.join("orphan.tmp"), [9])
        .await
        .unwrap();
    cache.maintain().await.unwrap();
    assert!(cache.get(second).await.unwrap().is_none());
    assert!(
        tokio::fs::read_dir(&cache.root)
            .await
            .unwrap()
            .next_entry()
            .await
            .unwrap()
            .is_none()
    );
}
#[tokio::test]
async fn concurrent_writes_are_atomic_and_metadata_matches_winner() {
    let (_directory, cache) = fixture().await;
    let url = "https://example.com/";
    let (first, second) = tokio::join!(
        cache.set(url, Arc::new(vec![1; 64])),
        cache.set(url, Arc::new(vec![2; 96]))
    );
    first.unwrap();
    second.unwrap();
    let bytes = cache.get(url).await.unwrap().unwrap();
    assert!(bytes == vec![1; 64] || bytes == vec![2; 96]);
    cache.invalidate(url).await.unwrap();
    assert!(cache.get(url).await.unwrap().is_none());
}
