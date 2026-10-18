use super::*;
use policy::Policy;

fn enqueue(
    policy: &mut Policy,
    owner: &str,
    url: &str,
    id: &str,
    priority: Priority,
) -> oneshot::Receiver<BackendResult<Bytes>> {
    let (result, receiver) = oneshot::channel();
    policy.apply(Command::Enqueue {
        key: (owner.into(), 1, url.into()),
        id: id.into(),
        priority,
        job: async { Ok(Arc::new(vec![1])) }.boxed(),
        result,
    });
    receiver
}
fn cancel(policy: &mut Policy, owner: &str, id: &str) {
    policy.apply(Command::Cancel {
        owner: owner.into(),
        id: id.into(),
    });
}

#[test]
fn bounds_pending_and_reserves_execution_for_interactive_demand() {
    let mut policy = Policy::default();
    let _first = enqueue(&mut policy, "a", "first", "first", Priority::Background);
    let first = policy.start().unwrap();
    let _background = enqueue(
        &mut policy,
        "a",
        "background",
        "background",
        Priority::Background,
    );
    assert!(policy.start().is_none());
    let _interactive = enqueue(
        &mut policy,
        "a",
        "interactive",
        "interactive",
        Priority::Interactive,
    );
    let interactive = policy.start().unwrap();
    assert!(policy.start().is_none());
    for index in 0..7 {
        let _ = enqueue(
            &mut policy,
            "a",
            &format!("pending-{index}"),
            &format!("pending-{index}"),
            Priority::Background,
        );
    }
    let mut overflow = enqueue(
        &mut policy,
        "a",
        "overflow",
        "overflow",
        Priority::Background,
    );
    assert_eq!(
        overflow.try_recv().unwrap().unwrap_err().code,
        "PREVIEW_QUEUE_FULL"
    );
    policy.finish(interactive.0, Ok(Arc::new(vec![2])));
    assert!(policy.start().is_none());
    policy.finish(first.0, Ok(Arc::new(vec![1])));
    assert!(policy.start().is_some());
}

#[test]
fn interactive_evicts_latest_pending_background_and_runs_first() {
    let mut policy = Policy::default();
    let mut receivers = Vec::new();
    for index in 0..8 {
        receivers.push(enqueue(
            &mut policy,
            "a",
            &index.to_string(),
            &index.to_string(),
            Priority::Background,
        ));
    }
    let mut urgent = enqueue(&mut policy, "a", "urgent", "urgent", Priority::Interactive);
    assert_eq!(
        receivers[7].try_recv().unwrap().unwrap_err().code,
        "PREVIEW_CANCELLED"
    );
    let job = policy.start().unwrap();
    policy.finish(job.0, Ok(Arc::new(vec![9])));
    assert_eq!(urgent.try_recv().unwrap().unwrap().as_ref(), &[9]);
    assert!(receivers[0].try_recv().is_err());
}

#[test]
fn deduplicates_subscribers_and_only_last_cancel_interrupts_running_work() {
    let mut policy = Policy::default();
    let mut first = enqueue(&mut policy, "a", "same", "first", Priority::Background);
    let mut second = enqueue(&mut policy, "a", "same", "second", Priority::Interactive);
    let (id, _, mut cancellation) = policy.start().unwrap();
    assert!(policy.start().is_none());
    cancel(&mut policy, "a", "first");
    assert_eq!(
        first.try_recv().unwrap().unwrap_err().code,
        "PREVIEW_CANCELLED"
    );
    assert!(!cancellation.has_changed().unwrap());
    policy.finish(id, Ok(Arc::new(vec![8])));
    assert_eq!(second.try_recv().unwrap().unwrap().as_ref(), &[8]);

    let _third = enqueue(&mut policy, "a", "new", "third", Priority::Interactive);
    let (_, _, cancelled) = policy.start().unwrap();
    cancel(&mut policy, "a", "third");
    assert!(*cancelled.borrow());
    assert!(cancellation.has_changed().is_err() || *cancellation.borrow_and_update());
}

#[test]
fn cancellation_race_is_owner_scoped_and_stale_completions_cannot_settle_replacements() {
    let mut policy = Policy::default();
    cancel(&mut policy, "a", "early");
    let mut rejected = enqueue(&mut policy, "a", "url", "early", Priority::Interactive);
    assert_eq!(
        rejected.try_recv().unwrap().unwrap_err().code,
        "PREVIEW_CANCELLED"
    );
    let mut other_owner = enqueue(&mut policy, "b", "url", "early", Priority::Interactive);
    let first = policy.start().unwrap();
    cancel(&mut policy, "b", "early");
    let mut replacement = enqueue(
        &mut policy,
        "b",
        "url",
        "replacement",
        Priority::Interactive,
    );
    let second = policy.start().unwrap();
    policy.finish(first.0, Err(cancelled()));
    assert_eq!(
        other_owner.try_recv().unwrap().unwrap_err().code,
        "PREVIEW_CANCELLED"
    );
    assert!(replacement.try_recv().is_err());
    policy.finish(second.0, Ok(Arc::new(vec![7])));
    assert_eq!(replacement.try_recv().unwrap().unwrap().as_ref(), &[7]);
}

#[test]
fn close_rejects_owner_waiters_and_keeps_running_work_counted_until_dropped() {
    let mut policy = Policy::default();
    let mut owner = enqueue(&mut policy, "a", "url", "a", Priority::Interactive);
    let first = policy.start().unwrap();
    let _other = enqueue(&mut policy, "b", "url", "b", Priority::Interactive);
    let second = policy.start().unwrap();
    policy.apply(Command::Close {
        owner: "a".into(),
        closed: None,
    });
    assert_eq!(
        owner.try_recv().unwrap().unwrap_err().code,
        "PREVIEW_CANCELLED"
    );
    assert!(*first.2.borrow());
    let _pending = enqueue(&mut policy, "b", "next", "next", Priority::Interactive);
    assert!(policy.start().is_none());
    policy.finish(first.0, Err(cancelled()));
    assert!(policy.start().is_some());
    policy.finish(second.0, Ok(Arc::new(vec![1])));
}
