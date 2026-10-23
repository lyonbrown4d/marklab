use super::*;
#[test]
fn external_tab_navigation_allows_intentional_lan_urls_and_rejects_privileged_origins() {
  for url in [
    "https://example.com/path?q=one#two",
    "http://127.0.0.1:3000/",
    "https://router.local/",
  ] {
    assert!(normalize(url).is_ok(), "{url}");
  }
  for url in [
    "file:///private.txt",
    "tauri://localhost/index.html",
    "marklab-asset://local/v1/test",
    "javascript:alert(1)",
    "https://user:secret@example.com/",
    "https://example.com/\nnext",
  ] {
    assert!(normalize(url).is_err(), "{url}");
  }
  assert!(normalize(&format!("https://example.com/{}", "中".repeat(1400))).is_err());
}
#[test]
fn bounds_never_cover_native_content_outside_the_owner_window() {
  let bounds = Bounds {
    height: u32::MAX,
    width: u32::MAX,
    x: i32::MAX,
    y: -100,
  };
  assert_eq!(
    create::clip(&bounds, 800, 600).unwrap(),
    Bounds {
      height: 600,
      width: 1,
      x: 799,
      y: 0
    }
  );
  assert!(create::clip(&Bounds { width: 0, ..bounds }, 800, 600).is_err());
}
#[test]
fn tab_events_and_ids_preserve_the_frontend_contract() {
  for id in ["tab:one", "a-b_c.0"] {
    identifier(id).unwrap();
  }
  for id in ["", "../a/b", "hello space", "中"] {
    assert!(identifier(id).is_err());
  }
  let event = serde_json::to_value(Event::OpenRequested {
    tab_id: "web:1".into(),
    url: "https://example.com/".into(),
  })
  .unwrap();
  assert_eq!(event["type"], "open-requested");
  assert_eq!(event["tabId"], "web:1");
  assert_eq!(bounded_text("A😀B", 3), "A😀");
}
#[test]
fn stale_callbacks_do_not_match_a_recreated_tab_with_the_same_id() {
  let manager = WebTabs::default();
  manager
    .inner
    .owners
    .lock()
    .unwrap()
    .entry("main".into())
    .or_default()
    .entries
    .insert("one".into(), entry("one", true, 0));
  assert!(manager.current("main", "one", "new-native-view"));
  assert!(!manager.current("main", "one", "old-native-view"));
  manager.close_window("main");
  assert!(!manager.current("main", "one", "new-native-view"));
}

pub(super) fn entry(id: &str, active: bool, touched: u64) -> Entry {
  Entry {
    view: None,
    state: TabState {
      active,
      can_go_back: false,
      can_go_forward: false,
      error: None,
      status: TabStatus::Loading,
      tab_id: id.into(),
      title: String::new(),
      url: "https://example.com/".into(),
    },
    bounds: Bounds {
      width: 100,
      height: 100,
      x: 0,
      y: 0,
    },
    touched,
    generation: 0,
    workspace_generation: 1,
    monitor: None,
    instance: "new-native-view".into(),
    load: None,
    focused: Arc::new(std::sync::atomic::AtomicBool::new(false)),
  }
}

#[test]
fn resident_capacity_evicts_only_the_owners_least_recently_used_inactive_tab() {
  let manager = WebTabs::default();
  {
    let mut owners = manager.inner.owners.lock().unwrap();
    owners.insert(
      "first".into(),
      Owner {
        entries: [
          entry("active", true, 0),
          entry("newer", false, 20),
          entry("oldest", false, 10),
        ]
        .into_iter()
        .map(|entry| (entry.state.tab_id.clone(), entry))
        .collect(),
        ..Owner::default()
      },
    );
    owners.insert(
      "second".into(),
      Owner {
        entries: [("other".into(), entry("other", false, 0))].into(),
        ..Owner::default()
      },
    );
  }
  // These placeholders also represent failed creation attempts: they still
  // consume registry capacity and must not permit unbounded failed entries.
  assert_eq!(
    activation::eviction_candidate(&manager.entries("first")).unwrap(),
    Some("oldest".into())
  );
  assert_eq!(
    activation::eviction_candidate(&manager.entries("second")).unwrap(),
    None
  );
  assert_eq!(activation::eviction_candidate(&[]).unwrap(), None);
  assert!(
    activation::eviction_candidate(&[
      entry("one", true, 0),
      entry("two", true, 1),
      entry("three", true, 2)
    ])
    .is_err()
  );
}

#[test]
fn preview_capture_only_accepts_the_ready_active_instance_and_current_url() {
  let mut tab = entry("one", true, 0);
  let url = tab.state.url.clone();
  assert!(!create::capture_eligible(&tab, "new-native-view", &url));
  tab.state.status = TabStatus::Ready;
  assert!(create::capture_eligible(&tab, "new-native-view", &url));
  assert!(!create::capture_eligible(
    &tab,
    "replaced-native-view",
    &url
  ));
  assert!(!create::capture_eligible(
    &tab,
    "new-native-view",
    "https://example.com/previous-page"
  ));
  tab.state.active = false;
  assert!(!create::capture_eligible(&tab, "new-native-view", &url));
  tab.state.active = true;
  tab.state.status = TabStatus::Closed;
  assert!(!create::capture_eligible(&tab, "new-native-view", &url));
}
