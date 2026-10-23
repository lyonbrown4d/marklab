use super::*;

async fn fixture() -> (tempfile::TempDir, LinkPreviewService, SqlitePool) {
  let directory = tempfile::tempdir().unwrap();
  let pool = sqlx::sqlite::SqlitePoolOptions::new()
    .max_connections(1)
    .connect("sqlite::memory:")
    .await
    .unwrap();
  let service = LinkPreviewService::new(pool.clone(), directory.path().join("previews"))
    .await
    .unwrap();
  (directory, service, pool)
}

#[tokio::test]
async fn newer_live_request_wins_even_before_it_finishes_and_rejects_older_late_completions() {
  let (_directory, service, _) = fixture().await;
  let url = "https://example.com/";
  let first = service.begin_live_capture(url, "view-a:1").await.unwrap();
  // Identical requests still share a queue job; switching away and back must
  // allocate another sequence instead of joining the obsolete first A job.
  assert_eq!(
    service.begin_live_capture(url, "view-a:1").await.unwrap(),
    first
  );
  let second = service.begin_live_capture(url, "view-b:1").await.unwrap();
  let old = Arc::new(vec![1]);
  let current = Arc::new(vec![2]);
  assert!(
    commit(&service, url, old.clone(), CaptureSource::Live(first))
      .await
      .is_err()
  );
  assert!(service.inner.screenshots.get(url).await.is_none());
  commit(&service, url, current.clone(), CaptureSource::Live(second))
    .await
    .unwrap();
  assert!(
    commit(&service, url, old.clone(), CaptureSource::Live(first))
      .await
      .is_err()
  );
  assert_eq!(*service.memory_screenshot(url).await.unwrap(), [2]);
  assert_eq!(service.inner.disk.get(url).await.unwrap().unwrap(), [2]);
  let static_result = commit(&service, url, old, CaptureSource::Static(0))
    .await
    .unwrap();
  assert!(Arc::ptr_eq(&static_result, &current));

  let returned = service.begin_live_capture(url, "view-a:1").await.unwrap();
  assert!(returned > second && second > first);
  commit(
    &service,
    url,
    Arc::new(vec![3]),
    CaptureSource::Live(returned),
  )
  .await
  .unwrap();
  assert!(
    commit(&service, url, current, CaptureSource::Live(second))
      .await
      .is_err()
  );
  assert_eq!(*service.memory_screenshot(url).await.unwrap(), [3]);
}

#[test]
fn live_order_state_is_bounded_and_eviction_never_authorizes_an_old_completion() {
  let mut order = LiveCaptureOrder::default();
  for index in 0..300 {
    order
      .request(&format!("https://example.com/{index}"), "view:1")
      .unwrap();
  }
  order.latest.run_pending_tasks();
  assert!(order.latest.entry_count() <= 128);
  let url = "https://example.com/evicted";
  let sequence = order.request(url, "view:1").unwrap();
  order.latest.invalidate(url);
  assert!(order.ensure_current(url, sequence).is_err());
}

#[tokio::test]
async fn completed_live_capture_wins_over_older_static_work_in_memory_and_on_disk() {
  let (_directory, service, _) = fixture().await;
  let url = "https://example.com/";
  let mut encoded = std::io::Cursor::new(Vec::new());
  image::RgbaImage::from_pixel(2, 2, image::Rgba([200, 10, 20, 255]))
    .write_to(&mut encoded, image::ImageFormat::Png)
    .unwrap();
  let live = Arc::new(encoded.into_inner());
  let order = service.begin_live_capture(url, "view-a:1").await.unwrap();
  commit(&service, url, live.clone(), CaptureSource::Live(order))
    .await
    .unwrap();
  let old = Arc::new(vec![1, 2, 3]);
  let memory = commit(&service, url, old.clone(), CaptureSource::Static(0))
    .await
    .unwrap();
  assert!(Arc::ptr_eq(&memory, &live));
  service.inner.screenshots.invalidate(url).await;
  let disk = commit(&service, url, old, CaptureSource::Static(0))
    .await
    .unwrap();
  let decoded = image::load_from_memory(&disk).unwrap().to_rgba8();
  assert_eq!(decoded.get_pixel(960, 540).0, [200, 10, 20, 255]);
  assert_eq!(service.inner.disk.get(url).await.unwrap().unwrap(), *live);
}

async fn commit(
  service: &LinkPreviewService,
  url: &str,
  bytes: Arc<Vec<u8>>,
  source: CaptureSource,
) -> BackendResult<Arc<Vec<u8>>> {
  let order = service.inner.screenshot_writes.lock().await;
  service.commit_screenshot(url, bytes, source, &order).await
}

#[tokio::test]
async fn disk_hydration_preserves_capture_age_and_expired_memory_is_not_reused() {
  let (_directory, service, pool) = fixture().await;
  let url = "https://example.com/";
  let mut encoded = std::io::Cursor::new(Vec::new());
  image::RgbaImage::new(2, 2)
    .write_to(&mut encoded, image::ImageFormat::Png)
    .unwrap();
  service
    .inner
    .disk
    .set(url, Arc::new(encoded.into_inner()))
    .await
    .unwrap();
  let now = crate::assets::now_ms() as i64;
  let captured_at = now - super::super::super::disk_cache::TTL_MS + 60_000;
  sqlx::query("UPDATE web_preview_cache SET captured_at_ms=?")
    .bind(captured_at)
    .execute(&pool)
    .await
    .unwrap();
  let screenshot = service.cached_disk_bytes(url).await.unwrap();
  assert_eq!(screenshot.captured_at, captured_at);
  service
    .inner
    .screenshots
    .insert(url.into(), screenshot.clone())
    .await;
  assert!(service.memory_screenshot(url).await.is_some());
  service
    .inner
    .screenshots
    .insert(
      url.into(),
      Screenshot {
        captured_at: captured_at - 120_000,
        ..screenshot
      },
    )
    .await;
  assert!(service.memory_screenshot(url).await.is_none());
  assert!(service.inner.screenshots.get(url).await.is_none());
}

#[tokio::test]
async fn invalidated_live_request_waiting_for_the_write_lock_cannot_supersede_valid_work() {
  use std::sync::atomic::{AtomicBool, Ordering};
  let (_directory, service, _) = fixture().await;
  let url = "https://example.com/";
  let latest = service.begin_live_capture(url, "valid:2").await.unwrap();
  let order = service.inner.screenshot_writes.lock().await;
  let valid = AtomicBool::new(true);
  let pending = service.begin_validated_live_capture(url, "stale:1", || {
    if valid.load(Ordering::SeqCst) {
      Ok(())
    } else {
      Err(super::super::super::queue::cancelled())
    }
  });
  tokio::pin!(pending);
  // Poll once while the lock is held, then invalidate the native revision.
  assert!(futures_util::poll!(&mut pending).is_pending());
  valid.store(false, Ordering::SeqCst);
  drop(order);
  assert!(pending.await.is_err());
  let order = service.inner.screenshot_writes.lock().await;
  assert!(order.ensure_current(url, latest).is_ok());
}
