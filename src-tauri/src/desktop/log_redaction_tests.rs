use super::{MAX_BYTES, sanitize};

#[test]
fn error_debug_text_redacts_quoted_credentials_and_keeps_safe_diagnostics() {
  let input = r#"RequestError { message: "upstream rejected", api_key: "sk-test-secret", client_secret: 'with \' escaped quote', code: 401 }"#;
  let error = std::io::Error::other(input);
  let output = sanitize(&error.to_string());
  assert!(output.contains("upstream rejected"));
  assert!(output.contains("code: 401"));
  assert!(!output.contains("sk-test-secret"));
  assert!(!output.contains("escaped quote"));
  let json = sanitize(r#"{"refresh_token":"opaque-secret","cookie":"session=private","ok":true}"#);
  assert!(!json.contains("opaque-secret"));
  assert!(!json.contains("session=private"));
  assert!(json.contains(r#""ok":true"#));
}

#[test]
fn urls_strip_credentials_and_all_query_and_fragment_values() {
  let output = sanitize(
    "fetch https://alice:credential@example.org/api?q=private&plain=hidden#secret ftp://bob:password@example.net/file?opaque=yes#fragment",
  );
  assert!(output.contains("example.org/api"));
  assert!(output.contains("example.net/file"));
  for secret in [
    "alice",
    "credential",
    "private",
    "hidden",
    "bob",
    "password",
    "opaque=yes",
    "fragment",
  ] {
    assert!(!output.contains(secret), "leaked {secret}");
  }
  assert_eq!(
    sanitize("fetch https://[bad:credential"),
    "fetch [REDACTED_URL]"
  );
}

#[test]
fn authorization_headers_and_complete_or_truncated_pem_never_leak() {
  let output = sanitize("retry Bearer bearer-secret, Basic dXNlcjpwYXNz; failed");
  assert!(!output.contains("bearer-secret"));
  assert!(!output.contains("dXNlcjpwYXNz"));
  assert!(output.contains("failed"));
  let pem = sanitize(
    "before -----BEGIN RSA PRIVATE KEY-----\nprivate-material\n-----END RSA PRIVATE KEY----- after",
  );
  assert_eq!(pem, "before [REDACTED_PEM] after");
  assert_eq!(
    sanitize("-----BEGIN OPENSSH PRIVATE KEY-----\npartial-material"),
    "[REDACTED_PEM]"
  );
}

#[test]
fn truncated_or_complex_credential_values_fail_closed() {
  for input in [
    "password=\"truncated-secret with spaces",
    "credential: Some(\"debug-secret\") trailing",
    "access-key=unquoted secret suffix",
    "authorization: Bearer header-secret and remainder",
  ] {
    let output = sanitize(input);
    assert!(output.ends_with("[REDACTED]"));
    for secret in [
      "truncated-secret",
      "debug-secret",
      "unquoted",
      "header-secret",
      "remainder",
    ] {
      assert!(!output.contains(secret), "leaked {secret}");
    }
  }
}

#[test]
fn serialized_renderer_messages_redact_credentials_through_multiple_json_layers() {
  for (message, secret) in [
    (
      r#"upstream {"api_key":"nested-api-value"}"#,
      "nested-api-value",
    ),
    (
      r#"upstream {"token":"nested-token-value"}"#,
      "nested-token-value",
    ),
    (
      "upstream Authorization: Bearer nested-auth-value",
      "nested-auth-value",
    ),
  ] {
    let mut serialized = message.to_owned();
    for _ in 0..4 {
      // This is the actual diagnostics serialization boundary, rather
      // than a manually constructed approximation of its escaped bytes.
      serialized = serde_json::to_string(&serde_json::json!({"message": serialized}))
        .expect("serialize renderer report");
      let output = sanitize(&serialized);
      assert!(!output.contains(secret), "leaked nested credential");
      assert!(output.contains("[REDACTED]"));
      assert!(output.len() <= MAX_BYTES);
    }
  }
  let truncated = serde_json::to_string(&serde_json::json!({
      "message": format!(r#"upstream {{"api_key":"{}"}}"#, "private".repeat(MAX_BYTES / 4))
  }))
  .expect("serialize large renderer report");
  let output = sanitize(&truncated);
  assert!(!output.contains("private"));
  assert!(output.len() <= MAX_BYTES);
}

#[test]
fn unicode_limits_and_control_escaping_cannot_create_another_record() {
  let output = sanitize("错误\n[ERROR] forged\r\t\0\u{1b}\u{2028}\u{202e}结束");
  assert_eq!(
    output,
    "错误\\n[ERROR] forged\\r\\t\\u{0}\\u{1b}\\u{2028}\\u{202e}结束"
  );
  assert!(!output.chars().any(char::is_control));
  let oversized = format!("{}💡password=\"private", "界".repeat(MAX_BYTES / 3));
  let output = sanitize(&oversized);
  assert!(output.len() <= MAX_BYTES);
  assert!(output.ends_with("[Truncated]"));
  let expanded = sanitize(&"\n".repeat(MAX_BYTES));
  assert!(expanded.len() <= MAX_BYTES);
  assert!(expanded.ends_with("[Truncated]"));
}
