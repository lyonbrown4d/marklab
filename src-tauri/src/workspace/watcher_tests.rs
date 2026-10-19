use super::{MAX_BATCH_PATHS, collect};
use notify::{
  Event, EventKind,
  event::{AccessKind, AccessMode, Flag, ModifyKind},
};
use std::{collections::BTreeSet, path::PathBuf};

fn root() -> PathBuf {
  std::env::temp_dir().join("marklab-synthetic-watch-root")
}

#[test]
fn rescan_overrides_access_and_discards_previously_collected_paths() {
  let root = root();
  let mut paths = BTreeSet::from([root.join("before.md")]);
  let mut full = false;
  collect(
    Ok(Event::new(EventKind::Access(AccessKind::Any)).set_flag(Flag::Rescan)),
    &root,
    &mut paths,
    &mut full,
  );
  assert!(full);
  assert!(paths.is_empty());
  collect(
    Ok(Event::new(EventKind::Any).add_path(root.join("after.md"))),
    &root,
    &mut paths,
    &mut full,
  );
  assert!(paths.is_empty(), "full invalidation must remain bounded");
}

#[test]
fn root_unknown_and_lost_events_require_full_buffer_refresh() {
  let root = root();
  for event in [
    Ok(Event::new(EventKind::Modify(ModifyKind::Any)).add_path(root.clone())),
    Ok(Event::new(EventKind::Any)),
    Ok(Event::new(EventKind::Other)),
    Ok(Event::new(EventKind::Any).add_path(PathBuf::new())),
    Err(notify::Error::generic("event history lost")),
  ] {
    let mut paths = BTreeSet::from([root.join("open.md")]);
    let mut full = false;
    collect(event, &root, &mut paths, &mut full);
    assert!(full);
    assert!(paths.is_empty());
  }
}

#[test]
fn unique_path_overflow_becomes_full_invalidation_without_unbounded_growth() {
  let root = root();
  let mut paths = BTreeSet::new();
  let mut full = false;
  let mut event = Event::new(EventKind::Modify(ModifyKind::Any));
  for index in 0..MAX_BATCH_PATHS {
    event.paths.push(root.join(format!("{index}.md")));
  }
  collect(Ok(event.clone()), &root, &mut paths, &mut full);
  assert_eq!(paths.len(), MAX_BATCH_PATHS);
  assert!(!full);
  collect(Ok(event), &root, &mut paths, &mut full);
  assert!(!full, "duplicate paths do not consume additional capacity");
  collect(
    Ok(Event::new(EventKind::Any).add_path(root.join("overflow.md"))),
    &root,
    &mut paths,
    &mut full,
  );
  assert!(full);
  assert!(paths.is_empty());
}

#[test]
fn incremental_batches_coalesce_paths_and_ignore_access_internal_and_outside_paths() {
  let root = root();
  let mut paths = BTreeSet::new();
  let mut full = false;
  for event in [
    Event::new(EventKind::Access(AccessKind::Any)),
    Event::new(EventKind::Access(AccessKind::Any)).add_path(root.clone()),
    Event::new(EventKind::Any).add_path(root.join(".git/index")),
    Event::new(EventKind::Any).add_path(root.join(".marklab/config")),
    Event::new(EventKind::Any).add_path(root.join(".tmp-save")),
    Event::new(EventKind::Any).add_path(root.parent().expect("parent").join("outside.md")),
    Event::new(EventKind::Any).add_path(root.join("note.md")),
    Event::new(EventKind::Modify(ModifyKind::Any)).add_path(root.join("note.md")),
    Event::new(EventKind::Any).add_path(root.join("folder")),
  ] {
    collect(Ok(event), &root, &mut paths, &mut full);
  }
  assert!(!full);
  assert_eq!(
    paths,
    BTreeSet::from([root.join("folder"), root.join("note.md")])
  );
}

#[test]
fn git_invalidation_ignores_read_batches_but_preserves_metadata_changes_and_lost_events() {
  let root = root();
  let mut paths = BTreeSet::new();
  let mut full = false;
  let mut git_changed = false;
  for kind in [
    AccessKind::Open(AccessMode::Any),
    AccessKind::Close(AccessMode::Read),
    AccessKind::Any,
  ] {
    git_changed |= collect(
      Ok(Event::new(EventKind::Access(kind)).add_path(root.join(".git/index"))),
      &root,
      &mut paths,
      &mut full,
    );
  }
  assert!(
    !git_changed,
    "reads must not evict their own Git query cache"
  );
  assert!(!full);
  assert!(paths.is_empty());
  git_changed |= collect(
    Ok(Event::new(EventKind::Modify(ModifyKind::Any)).add_path(root.join(".git/index"))),
    &root,
    &mut paths,
    &mut full,
  );
  assert!(
    git_changed,
    "hidden Git metadata writes must still invalidate"
  );
  assert!(paths.is_empty(), "Git metadata must stay out of the tree");
  for event in [
    Ok(Event::new(EventKind::Access(AccessKind::Any)).set_flag(Flag::Rescan)),
    Err(notify::Error::generic("lost history")),
  ] {
    full = false;
    assert!(collect(event, &root, &mut paths, &mut full));
    assert!(full);
  }
}
