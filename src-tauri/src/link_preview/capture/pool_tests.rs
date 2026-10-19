use super::*;
use deadpool::managed::Pool;
use std::sync::{Arc, atomic::AtomicBool};

#[tokio::test]
async fn cancelled_lease_discards_slot_and_clean_lease_returns_it() {
  let pool = Pool::builder(SlotManager).max_size(2).build().unwrap();
  let workers = Workers {
    pool: pool.clone(),
    reaping: Arc::new(AtomicBool::new(false)),
  };
  let object = pool.get().await.unwrap();
  let cancelled = Lease {
    object: Some(object),
    workers: workers.clone(),
    clean: false,
  };
  drop(cancelled);
  assert_eq!(pool.status().size, 0);
  let object = pool.get().await.unwrap();
  let clean = Lease {
    object: Some(object),
    workers,
    clean: true,
  };
  drop(clean);
  assert_eq!(pool.status().size, 1);
  assert_eq!(pool.status().available, 1);
  let first = pool.get().await.unwrap();
  let second = pool.get().await.unwrap();
  assert_eq!(pool.status().size, 2);
  let wait = pool.get();
  tokio::pin!(wait);
  assert!(
    tokio::time::timeout(std::time::Duration::from_millis(10), &mut wait)
      .await
      .is_err()
  );
  drop(first);
  assert!(wait.await.is_ok());
  drop(second);
  pool.close();
}
