use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

#[tokio::test]
async fn coalesces_same_key_and_bounds_entry_weight() {
    let calls = AtomicUsize::new(0);
    let cache: Cache<String, Arc<Vec<u8>>> = Cache::builder()
        .max_capacity(32 * 1024 * 1024)
        .weigher(|key: &String, bytes: &Arc<Vec<u8>>| weight(key.len() + bytes.len()))
        .build();
    let load = || async {
        calls.fetch_add(1, Ordering::Relaxed);
        tokio::time::sleep(Duration::from_millis(5)).await;
        Ok::<_, crate::error::BackendError>(Arc::new(vec![1, 2, 3]))
    };
    let (first, second) = tokio::join!(
        cache.try_get_with("same".into(), load()),
        cache.try_get_with("same".into(), load())
    );
    assert!(Arc::ptr_eq(&first.unwrap(), &second.unwrap()));
    assert_eq!(calls.load(Ordering::Relaxed), 1);
    assert_eq!(weight(1), 256 * 1024);
    assert_eq!(weight(1024 * 1024), 1024 * 1024);
    for index in 0..200 {
        cache.insert(index.to_string(), Arc::new(vec![0])).await;
    }
    cache.run_pending_tasks().await;
    assert!(cache.entry_count() <= 128);
    assert!(cache.weighted_size() <= 32 * 1024 * 1024);
}
#[tokio::test]
async fn closes_only_owner_cache_and_does_not_cache_failures() {
    let directory = tempfile::tempdir().unwrap();
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    let service = LinkPreviewService::new(pool, directory.path().join("previews"))
        .await
        .unwrap();
    let value = Fetched::Page(PreviewResult::Webpage {
        url: "https://example.com/".into(),
        canonical: None,
        description: None,
        favicon: None,
        image: None,
        site_name: None,
        title: None,
    });
    let first = ("first".into(), 1, "https://example.com/".into());
    let second = ("second".into(), 2, "https://example.com/".into());
    service
        .inner
        .cache
        .insert(first.clone(), value.clone())
        .await;
    service.inner.cache.insert(second.clone(), value).await;
    service.close_window("first").await;
    assert!(service.inner.cache.get(&first).await.is_none());
    assert!(service.inner.cache.get(&second).await.is_some());
    assert!(
        service
            .inner
            .cache
            .try_get_with(first.clone(), async {
                Err::<Fetched, _>(network::failure("failed"))
            })
            .await
            .is_err()
    );
    assert!(service.inner.cache.get(&first).await.is_none());
}
