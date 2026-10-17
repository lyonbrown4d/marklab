use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
fn operation(value: &str) -> Value {
    Value::Operation(Operation {
        operation: Some(value.into()),
    })
}
fn name(value: &Value) -> &str {
    let Value::Operation(value) = value else {
        panic!("operation query expected")
    };
    value.operation.as_deref().unwrap()
}
#[tokio::test]
async fn concurrent_queries_share_initialization_and_cached_result() {
    let queries = Queries::default();
    let calls = AtomicUsize::new(0);
    let root = Path::new("/fixture");
    let load = || async {
        calls.fetch_add(1, Ordering::AcqRel);
        tokio::task::yield_now().await;
        Ok(operation("one"))
    };
    let (first, second) = tokio::join!(
        queries.get(root, Query::Operation, load()),
        queries.get(root, Query::Operation, load())
    );
    assert_eq!(name(first.unwrap().as_ref()), "one");
    assert_eq!(name(second.unwrap().as_ref()), "one");
    queries.get(root, Query::Operation, load()).await.unwrap();
    assert_eq!(calls.load(Ordering::Acquire), 1);
}
#[tokio::test]
async fn invalidation_during_load_cannot_join_or_repopulate_old_epoch() {
    let queries = Arc::new(Queries::default());
    let root = Path::new("/fixture");
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (finish_tx, finish_rx) = tokio::sync::oneshot::channel();
    let stale_cache = queries.clone();
    let stale = tokio::spawn(async move {
        stale_cache
            .get(root, Query::Operation, async {
                started_tx.send(()).unwrap();
                finish_rx.await.unwrap();
                Ok(operation("old"))
            })
            .await
    });
    started_rx.await.unwrap();
    queries.invalidate(root);
    let fresh = queries
        .get(root, Query::Operation, async { Ok(operation("new")) })
        .await
        .unwrap();
    assert_eq!(name(&fresh), "new");
    finish_tx.send(()).unwrap();
    assert_eq!(name(stale.await.unwrap().unwrap().as_ref()), "old");
    let cached = queries
        .get(root, Query::Operation, async {
            Err(BackendError::new(
                "unexpected_cache_miss",
                "Stale completion replaced the fresh cache",
            ))
        })
        .await
        .unwrap();
    assert_eq!(name(&cached), "new");
}
#[tokio::test]
async fn waiting_queries_observe_failed_mutation_invalidation_before_writer_releases() {
    let repo = super::super::test_support::Repository::new().await;
    repo.commit("base\n").await;
    let state = Arc::new(GitState::default());
    let root = repo.root();
    let first = state.query(root, Query::Status).await.unwrap();
    let Value::Status(first) = first.as_ref() else {
        panic!("status expected")
    };
    assert!(first.untracked.is_empty());
    let gate = state.lock(root).await;
    let writer = gate.lock().await;
    let invalidation = state.invalidation(root);
    tokio::fs::write(root.join("new.md"), "survives failed command")
        .await
        .unwrap();
    let next_state = state.clone();
    let next_root = root.join(".");
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let waiting = tokio::spawn(async move {
        started_tx.send(()).unwrap();
        next_state.query(&next_root, Query::Status).await
    });
    started_rx.await.unwrap();
    tokio::task::yield_now().await;
    assert!(!waiting.is_finished());
    // The guard also covers an operation returning Err after partially changing disk.
    drop(invalidation);
    assert!(!waiting.is_finished());
    drop(writer);
    let fresh = waiting.await.unwrap().unwrap();
    let Value::Status(fresh) = fresh.as_ref() else {
        panic!("status expected")
    };
    assert_eq!(fresh.untracked.len(), 1);
    assert_eq!(fresh.untracked[0].path, "new.md");
}

#[tokio::test]
async fn refresh_completion_invalidates_queries_loaded_during_external_changes() {
    let repo = super::super::test_support::Repository::new().await;
    repo.commit("base\n").await;
    let state = GitState::default();
    let root = repo.root();
    state.query(root, Query::Status).await.unwrap();
    let refreshing = state.invalidation(root);
    state.query(root, Query::Status).await.unwrap();
    tokio::fs::write(root.join("external.md"), "changed during refresh")
        .await
        .unwrap();
    drop(refreshing);
    let value = state.query(root, Query::Status).await.unwrap();
    let Value::Status(value) = value.as_ref() else {
        panic!("status expected")
    };
    assert_eq!(value.untracked[0].path, "external.md");
}

#[tokio::test]
async fn evicted_root_identity_does_not_reuse_an_inflight_value_key() {
    // Zero capacity deterministically evicts root state while leaving the
    // separate value initializer in flight; no timing or eviction-policy guess.
    let queries = Arc::new(Queries {
        epochs: Mutex::new(moka::sync::Cache::builder().max_capacity(0).build()),
        ..Queries::default()
    });
    let root = Path::new("/evicted-fixture");
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (finish_tx, finish_rx) = tokio::sync::oneshot::channel();
    let previous = queries.clone();
    let stale = tokio::spawn(async move {
        previous
            .get(root, Query::Operation, async {
                started_tx.send(()).unwrap();
                finish_rx.await.unwrap();
                Ok(operation("old"))
            })
            .await
    });
    started_rx.await.unwrap();
    {
        let epochs = queries.epochs.lock().unwrap();
        epochs.run_pending_tasks();
        assert!(!epochs.contains_key(root));
    }
    // Retain identities for subsequent requests again. The old value is still
    // in flight, so resetting a missing state to zero would join and hang here.
    *queries.epochs.lock().unwrap() = moka::sync::Cache::builder().max_capacity(256).build();
    let fresh = queries
        .get(root, Query::Operation, async { Ok(operation("fresh")) })
        .await
        .unwrap();
    assert_eq!(name(&fresh), "fresh");
    finish_tx.send(()).unwrap();
    assert_eq!(name(stale.await.unwrap().unwrap().as_ref()), "old");
    let cached = queries
        .get(root, Query::Operation, async {
            Err(BackendError::new(
                "unexpected_cache_miss",
                "Fresh root cache was lost",
            ))
        })
        .await
        .unwrap();
    assert_eq!(name(&cached), "fresh");
}

#[test]
fn root_epoch_state_has_a_bounded_entry_budget() {
    let queries = Queries::default();
    for index in 0..1024 {
        queries
            .epoch(Path::new(&format!("/fixture-{index}")))
            .unwrap();
    }
    let epochs = queries.epochs.lock().unwrap();
    epochs.run_pending_tasks();
    assert!(epochs.entry_count() <= 256);
}
