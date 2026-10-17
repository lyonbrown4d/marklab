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
        .insert(
            "one".into(),
            Entry {
                view: None,
                state: TabState {
                    active: true,
                    can_go_back: false,
                    can_go_forward: false,
                    error: None,
                    status: "loading".into(),
                    tab_id: "one".into(),
                    title: String::new(),
                    url: "https://example.com/".into(),
                },
                bounds: Bounds {
                    width: 100,
                    height: 100,
                    x: 0,
                    y: 0,
                },
                touched: 0,
                generation: 0,
                monitor: None,
                instance: "new-native-view".into(),
                load: None,
                focused: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            },
        );
    assert!(manager.current("main", "one", "new-native-view"));
    assert!(!manager.current("main", "one", "old-native-view"));
    manager.close_window("main");
    assert!(!manager.current("main", "one", "new-native-view"));
}
