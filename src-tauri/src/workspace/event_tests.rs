use crate::workspace::WorkspaceRegistry;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Listener, Manager, WebviewBuilder, WebviewWindowBuilder};

#[tokio::test]
async fn shared_workspace_events_reach_each_owner_once_and_never_another_root_or_child() {
  let directory = tempfile::tempdir().expect("fixture");
  let first_root = directory.path().join("first");
  let other_root = directory.path().join("other");
  tokio::fs::create_dir_all(&first_root)
    .await
    .expect("first root");
  tokio::fs::create_dir_all(&other_root)
    .await
    .expect("other root");
  let registry = WorkspaceRegistry::new(&directory.path().join("profile")).expect("registry");
  let workspace = registry
    .open_async("window-a", first_root.to_str(), false)
    .await
    .expect("first owner");
  let shared = registry
    .open_async("window-b", first_root.to_str(), false)
    .await
    .expect("shared owner");
  registry
    .open_async("window-c", other_root.to_str(), false)
    .await
    .expect("isolated owner");
  assert!(Arc::ptr_eq(&workspace, &shared));
  let app = tauri::test::mock_app();
  app.manage(registry);
  let first = WebviewWindowBuilder::new(&app, "window-a", Default::default())
    .build()
    .expect("first window");
  let second = WebviewWindowBuilder::new(&app, "window-b", Default::default())
    .build()
    .expect("second window");
  let third = WebviewWindowBuilder::new(&app, "window-c", Default::default())
    .build()
    .expect("other window");
  let raw = first.as_ref().window();
  let child = raw
    .add_child(
      WebviewBuilder::new("untrusted-child", Default::default()),
      tauri::LogicalPosition::new(0, 0),
      tauri::LogicalSize::new(100, 100),
    )
    .expect("child view");
  let received = Arc::new(Mutex::new(Vec::<String>::new()));
  for window in [&first, &second, &third] {
    let received = received.clone();
    let label = window.label().to_owned();
    window.listen("fs-buffer-status", move |event| {
      let revision: u64 = serde_json::from_str(event.payload()).expect("revision");
      received
        .lock()
        .expect("events")
        .push(format!("{label}:{revision}"));
    });
  }
  let child_received = received.clone();
  child.listen("fs-buffer-status", move |_| {
    child_received.lock().expect("events").push("child".into())
  });
  // A raw Window listener with the same label must not receive root-webview data.
  let raw_received = received.clone();
  raw.listen("fs-buffer-status", move |_| {
    raw_received
      .lock()
      .expect("events")
      .push("raw-window".into())
  });
  workspace
    .emit_to_owners(app.handle(), "fs-buffer-status", 7u64)
    .expect("scoped fanout");
  let mut events = received.lock().expect("events").clone();
  events.sort();
  assert_eq!(events, ["window-a:7", "window-b:7"]);

  received.lock().expect("events").clear();
  // Recents/updater-style app broadcasts must continue reaching all root owners.
  app
    .emit("fs-buffer-status", 8u64)
    .expect("global broadcast");
  let events = received.lock().expect("events");
  assert!(events.contains(&"window-a:8".into()));
  assert!(events.contains(&"window-b:8".into()));
  assert!(events.contains(&"window-c:8".into()));
}
