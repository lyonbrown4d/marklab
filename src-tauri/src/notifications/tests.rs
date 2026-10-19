use super::{Action, Category, Request, active::Active, policy::Preferences};
use crate::settings::PersistedValue;
use std::path::Path;

#[test]
fn preferences_keep_defaults_global_focus_and_per_category_switches() {
  let defaults = Preferences::parse(None);
  for category in [Category::Export, Category::Sync, Category::Update] {
    assert!(defaults.allows(category, false));
    assert!(!defaults.allows(category, true));
  }
  let value: PersistedValue = serde_json::from_value(serde_json::json!({"state": {
      "desktopNotificationsBackgroundOnly": false,
      "desktopNotificationSyncEnabled": false
  }}))
  .unwrap();
  let preferences = Preferences::parse(Some(&value));
  assert!(preferences.allows(Category::Export, true));
  assert!(preferences.allows(Category::Update, true));
  assert!(!preferences.allows(Category::Sync, false));
  let disabled: PersistedValue = serde_json::from_value(serde_json::json!({"state": {
      "desktopNotificationsEnabled": false
  }}))
  .unwrap();
  assert!(!Preferences::parse(Some(&disabled)).allows(Category::Export, false));
  let malformed: PersistedValue = serde_json::from_value(serde_json::json!({"state": {
      "desktopNotificationsEnabled": false, "desktopNotificationSyncEnabled": "false"
  }}))
  .unwrap();
  assert!(Preferences::parse(Some(&malformed)).allows(Category::Export, false));
}

#[test]
fn replaced_and_dismissed_instances_cannot_activate_new_actions() {
  let mut active = Active::default();
  let old = Request::update(Some("1.0"), Some("owner-old".into()));
  let current = Request::update(Some("2.0"), Some("owner-current".into()));
  assert!(active.insert("old-token".into(), old).is_empty());
  assert_eq!(
    active.insert("current-token".into(), current),
    ["update:downloaded"]
  );
  assert!(active.take("old-token").is_none());
  let action = active.take("current-token").unwrap();
  assert_eq!(action.owner.as_deref(), Some("owner-current"));
  assert_eq!(action.action, Action::FocusOwner);
  assert!(active.take("current-token").is_none());
}

#[test]
fn replacement_does_not_retire_the_old_action_before_native_close_acknowledges() {
  let mut active = Active::default();
  active.insert(
    "original".into(),
    Request::update(None, Some("owner".into())),
  );
  assert_eq!(
    active.replacements("update:downloaded"),
    ["update:downloaded"]
  );
  // A failed native close leaves the old instance available; planning is side-effect free.
  assert_eq!(
    active.take("original").unwrap().owner.as_deref(),
    Some("owner")
  );
}

#[test]
fn active_notifications_are_bounded_without_retaining_evicted_actions() {
  let mut active = Active::default();
  for number in 0..256 {
    assert!(
      active
        .insert(
          format!("token-{number}"),
          Request::sync(&number.to_string(), Path::new("workspace"), "owner", true)
        )
        .is_empty()
    );
  }
  assert_eq!(
    active.insert(
      "latest".into(),
      Request::sync("last", Path::new("workspace"), "owner", true)
    ),
    ["sync:0"]
  );
  assert!(active.take("token-0").is_none());
  assert_eq!(active.ids().len(), 256);
}

#[test]
fn business_messages_do_not_expose_full_paths_or_install_updates_on_click() {
  let path = Path::new("private")
    .join("secret-workspace")
    .join("report.pdf");
  let success = Request::export("task", "pdf", &path, "owner", true);
  let failure = Request::export("task", "pdf", &path, "owner", false);
  assert_eq!(success.body, "PDF saved to report.pdf");
  assert_eq!(success.action, Action::RevealExport(path));
  assert_eq!(failure.body, "PDF report.pdf failed");
  assert_eq!(failure.action, Action::FocusOwner);
  assert_eq!(Request::update(None, None).action, Action::FocusOwner);
  assert_eq!(
    Request::sync("task", Path::new("/"), "owner", false).body,
    "Workspace needs attention"
  );
}
