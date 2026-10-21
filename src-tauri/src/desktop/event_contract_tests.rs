use super::*;
use serde_json::json;

#[test]
fn tree_events_preserve_incremental_change_and_invalidation_wire_shapes() {
  let root = crate::workspace::RootInfo {
    kind: crate::workspace::RootKind::External,
    path: "/notes".into(),
  };
  let invalidated = WorkspaceInvalidated {
    kind: InvalidationKind::Invalidated,
    root: root.clone(),
    generation: 2,
    previous_revision: 3,
    revision: 4,
  };
  let expected = json!({
    "kind": "invalidated", "root": { "kind": "external", "path": "/notes" },
    "generation": 2, "previousRevision": 3, "revision": 4,
  });
  assert_eq!(serde_json::to_value(&invalidated).unwrap(), expected);
  assert_eq!(
    serde_json::to_value(WorkspaceTreeDeltaEvent::from(invalidated)).unwrap(),
    expected
  );
  let entry = crate::workspace::Entry {
    kind: crate::workspace::EntryKind::File,
    name: "new.md".into(),
    path: "new.md".into(),
  };
  let event = WorkspaceTreeDeltaEvent::Changes {
    root,
    generation: 2,
    previous_revision: 4,
    revision: 5,
    changes: vec![
      WorkspaceTreeChange::Added {
        entry: entry.clone(),
      },
      WorkspaceTreeChange::Changed {
        path: "edit.md".into(),
      },
      WorkspaceTreeChange::Removed {
        path: "old.md".into(),
      },
      WorkspaceTreeChange::Renamed {
        from: "old-name.md".into(),
        entry,
      },
    ],
  };
  assert_eq!(
    serde_json::to_value(event).unwrap(),
    json!({
      "kind": "changes", "root": { "kind": "external", "path": "/notes" },
      "generation": 2, "previousRevision": 4, "revision": 5,
      "changes": [
        {"type":"added", "entry":{"kind":"file","name":"new.md","path":"new.md"}},
        {"type":"changed", "path":"edit.md"},
        {"type":"removed", "path":"old.md"},
        {"type":"renamed", "from":"old-name.md", "entry":{"kind":"file","name":"new.md","path":"new.md"}},
      ],
    })
  );
}
