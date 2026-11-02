use super::*;
use git_lfs_api::{Action, Auth, Client, ObjectError};

fn object(oid: &str) -> ObjectResult {
  ObjectResult {
    oid: oid.into(),
    size: 0,
    authenticated: None,
    actions: None,
    error: None,
  }
}

fn response(objects: Vec<ObjectResult>) -> BatchResponse {
  BatchResponse {
    transfer: Some("basic".into()),
    hash_algo: Some("sha256".into()),
    objects,
  }
}

fn context(endpoint: &str) -> Context {
  let endpoint = url::Url::parse(endpoint).unwrap();
  let http = reqwest_lfs::Client::builder()
    .redirect(reqwest_lfs::redirect::Policy::none())
    .build()
    .unwrap();
  Context {
    api: Client::with_http_client(endpoint.clone(), Auth::None, http.clone()),
    origin: endpoint.origin().ascii_serialization(),
    http,
    credentials: Some(("fixture".into(), "token".into())),
  }
}

#[test]
fn incomplete_duplicate_or_unrequested_batches_fail_closed() {
  let requested = vec![ObjectSpec {
    oid: "expected".into(),
    size: 1,
  }];
  for objects in [
    vec![],
    vec![object("other")],
    vec![object("expected"), object("expected")],
  ] {
    assert!(plan(response(objects), &requested, Operation::Upload).is_err());
  }
  let result = plan(
    response(vec![object("expected")]),
    &requested,
    Operation::Upload,
  )
  .unwrap();
  assert_eq!(result[0].size, 1);
  let mut invalid_size = object("expected");
  invalid_size.size = 2;
  assert!(plan(response(vec![invalid_size]), &requested, Operation::Upload).is_err());
  let mut invalid_adapter = response(vec![object("expected")]);
  invalid_adapter.transfer = Some("custom".into());
  assert!(plan(invalid_adapter, &requested, Operation::Upload).is_err());
}

#[test]
fn authentication_failures_keep_their_code_without_exposing_remote_text() {
  let mut value = object("expected");
  value.error = Some(ObjectError {
    code: 401,
    message: "https://example.test/object?token=test-value".into(),
  });
  let failure = plan(
    response(vec![value]),
    &[ObjectSpec {
      oid: "expected".into(),
      size: 1,
    }],
    Operation::Upload,
  )
  .unwrap_err();
  assert_eq!(failure.code, "git_authentication_required");
  assert!(!failure.message.contains("example.test"));
  assert!(!failure.message.contains("test-value"));
  let native: BackendError =
    git2::Error::from_str(&format!("{}: {}", failure.code, failure.message)).into();
  assert_eq!(native.code, failure.code);
}

#[test]
fn action_credentials_respect_origin_authentication_flag_and_explicit_headers() {
  let context = context("https://example.test/repo.git/info/lfs");
  let mut action = Action {
    href: "https://example.test/object".into(),
    ..Default::default()
  };
  let mut value = object("expected");
  let request = lfs_transfer_io::action_request(&context, &value, &action);
  assert_eq!(
    request.headers()["authorization"],
    "Basic Zml4dHVyZTp0b2tlbg=="
  );
  assert!(request.headers()["authorization"].is_sensitive());
  assert!(!request.url().as_str().contains("fixture"));
  value.authenticated = Some(true);
  assert!(
    !lfs_transfer_io::action_request(&context, &value, &action)
      .headers()
      .contains_key("authorization")
  );
  value.authenticated = Some(false);
  action.href = "https://foreign.test/object".into();
  assert!(
    !lfs_transfer_io::action_request(&context, &value, &action)
      .headers()
      .contains_key("authorization")
  );
  action
    .header
    .insert("Authorization".into(), "Bearer action-token".into());
  let request = lfs_transfer_io::action_request(&context, &value, &action);
  assert_eq!(request.headers()["authorization"], "Bearer action-token");
  assert!(request.headers()["authorization"].is_sensitive());
  action.header.insert("Content-Length".into(), "100".into());
  assert!(lfs_transfer_io::validate_action(&action).is_err());
}

#[tokio::test]
async fn private_same_origin_download_sends_credentials_as_a_header() {
  use std::io::{Read, Write};
  let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
  let address = listener.local_addr().unwrap();
  let server = std::thread::spawn(move || {
    let (mut stream, _) = listener.accept().unwrap();
    stream
      .set_read_timeout(Some(Duration::from_secs(5)))
      .unwrap();
    let mut bytes = Vec::new();
    let mut buffer = [0; 1024];
    while !bytes.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
      let count = stream.read(&mut buffer).unwrap();
      assert_ne!(count, 0);
      bytes.extend_from_slice(&buffer[..count]);
    }
    let request = String::from_utf8(bytes).unwrap();
    assert!(
      request
        .to_ascii_lowercase()
        .contains("authorization: basic zml4dhvyztp0b2tlbg==")
    );
    assert!(request.starts_with("GET /object HTTP/1.1"));
    stream
      .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\npayload")
      .unwrap();
  });
  let context = context(&format!("http://{address}/repo.git/info/lfs"));
  let directory = tempfile::tempdir().unwrap();
  let store = Store::new(directory.path());
  let (oid, size) = super::super::lfs::digest(&mut &b"payload"[..]).unwrap();
  let pointer = Pointer::new(oid, size);
  let value: ObjectResult = serde_json::from_value(serde_json::json!({
    "oid": oid.to_string(), "size": size, "authenticated": false,
    "actions": {"download": {"href": format!("http://{address}/object")}}
  }))
  .unwrap();
  lfs_transfer_io::transfer(
    &context,
    store.clone(),
    value,
    pointer.clone(),
    None,
    Operation::Download,
  )
  .await
  .unwrap();
  assert!(super::super::lfs::open_object(&store, &pointer).is_ok());
  server.join().unwrap();
}
