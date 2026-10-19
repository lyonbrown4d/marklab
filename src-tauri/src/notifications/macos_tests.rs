use super::Tokens;

#[test]
fn replacement_late_response_cannot_consume_the_current_instance() {
  let tokens = Tokens::default();
  assert!(tokens.replace("update", "old").expect("first").is_none());
  assert_eq!(
    tokens.replace("update", "new").expect("replace").as_deref(),
    Some("old")
  );
  assert!(!tokens.take("old"));
  assert!(tokens.contains("new"));
  assert!(tokens.take("new"));
  assert!(!tokens.take("new"));
}

#[test]
fn close_invalidates_one_instance_and_preserves_other_identifiers() {
  let tokens = Tokens::default();
  tokens.replace("export", "export-token").expect("export");
  tokens.replace("sync", "sync-token").expect("sync");
  let closing = tokens.get("export").expect("lookup").expect("token");
  // Lookup retains the token while native remove is pending or fails, so a
  // retry can still remove the OS notification instead of becoming a no-op.
  assert!(tokens.contains(&closing));
  assert_eq!(tokens.get("export").expect("retry"), Some(closing.clone()));
  assert!(tokens.take(&closing));
  assert!(!tokens.take("export-token"));
  assert!(tokens.take("sync-token"));
  assert!(!tokens.take("sync-token"));
}
