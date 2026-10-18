use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

struct Released(Arc<AtomicUsize>);
impl Drop for Released {
    fn drop(&mut self) {
        self.0.fetch_add(1, Ordering::SeqCst);
    }
}

#[tokio::test]
async fn actor_coalesces_demand_and_preserves_remaining_subscriber_on_cancel() {
    let queue = CaptureQueue::new();
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let (started, start) = oneshot::channel();
    let (complete, completion) = oneshot::channel();
    let key = ("owner".into(), 1, "https://example.com/".into());
    let first = queue
        .enqueue(
            key.clone(),
            "first".into(),
            Priority::Background,
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                let _ = started.send(());
                completion.await.map_err(|_| cancelled())
            }
            .boxed(),
        )
        .unwrap();
    start.await.unwrap();
    let count = calls.clone();
    let second = queue
        .enqueue(
            key,
            "second".into(),
            Priority::Interactive,
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Ok(Arc::new(vec![99]))
            }
            .boxed(),
        )
        .unwrap();
    queue.cancel("owner".into(), "first".into()).await.unwrap();
    assert_eq!(first.wait().await.unwrap_err().code, "PREVIEW_CANCELLED");
    complete.send(Arc::new(vec![7])).unwrap();
    assert_eq!(second.wait().await.unwrap().as_ref(), &[7]);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn close_waits_for_running_cancellation_to_drop_its_resource_and_releases_waiters() {
    let queue = CaptureQueue::new();
    let released = Arc::new(AtomicUsize::new(0));
    let resource = Released(released.clone());
    let (started, start) = oneshot::channel();
    let ticket = queue
        .enqueue(
            ("owner".into(), 1, "url".into()),
            "running".into(),
            Priority::Background,
            async move {
                let _resource = resource;
                let _ = started.send(());
                std::future::pending().await
            }
            .boxed(),
        )
        .unwrap();
    start.await.unwrap();
    let pending = queue
        .enqueue(
            ("owner".into(), 1, "next".into()),
            "pending".into(),
            Priority::Background,
            std::future::pending().boxed(),
        )
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), queue.close("owner".into()))
        .await
        .unwrap();
    assert_eq!(ticket.wait().await.unwrap_err().code, "PREVIEW_CANCELLED");
    assert_eq!(pending.wait().await.unwrap_err().code, "PREVIEW_CANCELLED");
    assert_eq!(released.load(Ordering::SeqCst), 1);
    let next = queue
        .enqueue(
            ("other".into(), 1, "next".into()),
            "next".into(),
            Priority::Interactive,
            async { Ok(Arc::new(vec![5])) }.boxed(),
        )
        .unwrap();
    assert_eq!(next.wait().await.unwrap().as_ref(), &[5]);
}

#[tokio::test]
async fn dropping_last_ticket_cancels_running_operation() {
    let queue = CaptureQueue::new();
    let released = Arc::new(AtomicUsize::new(0));
    let resource = Released(released.clone());
    let (started, start) = oneshot::channel();
    let (drop_sender, dropped) = oneshot::channel::<()>();
    let ticket = queue
        .enqueue(
            ("owner".into(), 1, "url".into()),
            "running".into(),
            Priority::Interactive,
            async move {
                let _resource = (resource, drop_sender);
                let _ = started.send(());
                std::future::pending().await
            }
            .boxed(),
        )
        .unwrap();
    start.await.unwrap();
    drop(ticket);
    assert!(
        tokio::time::timeout(Duration::from_secs(2), dropped)
            .await
            .unwrap()
            .is_err()
    );
    assert_eq!(released.load(Ordering::SeqCst), 1);
}
