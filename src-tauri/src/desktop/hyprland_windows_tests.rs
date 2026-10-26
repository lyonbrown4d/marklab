use super::*;

fn client(address: &str, stable: &str, fullscreen: u8) -> Client {
  Client {
    address: address.into(),
    stable_id: stable.into(),
    pid: i64::from(std::process::id()),
    title: "Marklab".into(),
    size: [900, 700],
    fullscreen,
    mapped: true,
  }
}
#[test]
fn tiled_is_not_maximized_and_fullscreen_keeps_native_behavior() {
  assert_eq!(maximized(&client("0x1", "one", 0)), Some(false));
  assert_eq!(maximized(&client("0x1", "one", 1)), Some(true));
  assert_eq!(maximized(&client("0x1", "one", 2)), None);
}
#[test]
fn resolves_each_owner_and_does_not_follow_focus_after_binding() {
  let first = client("0x1", "one", 0);
  let second = client("0x2", "two", 1);
  let mut owners = HashMap::new();
  resolve(
    &mut owners,
    &[first.clone()],
    "main",
    "Marklab",
    [900, 700],
    None,
    false,
  )
  .unwrap();
  let clients = [first.clone(), second.clone()];
  assert_eq!(
    resolve(
      &mut owners,
      &clients,
      "second",
      "Marklab",
      [900, 700],
      Some(&second),
      true
    )
    .unwrap()
    .address,
    "0x2"
  );
  assert_eq!(
    resolve(
      &mut owners,
      &clients,
      "main",
      "Marklab",
      [900, 700],
      Some(&second),
      false
    )
    .unwrap()
    .address,
    "0x1"
  );
  let mut changed = first;
  changed.fullscreen = 1;
  resolve(
    &mut owners,
    &[changed],
    "main",
    "Marklab",
    [900, 700],
    None,
    false,
  )
  .unwrap();
  assert_eq!(owners.get("main").unwrap().fullscreen, 1);
}
#[test]
fn ambiguous_or_foreign_windows_are_never_selected() {
  let first = client("0x1", "one", 0);
  let second = client("0x2", "two", 0);
  let mut owners = HashMap::new();
  assert!(
    resolve(
      &mut owners,
      &[first.clone(), second],
      "main",
      "Marklab",
      [900, 700],
      None,
      false
    )
    .is_err()
  );
  assert!(owners.is_empty());
  let mut foreign = first;
  foreign.pid += 1;
  assert!(
    resolve(
      &mut owners,
      &[foreign.clone()],
      "main",
      "Marklab",
      [900, 700],
      Some(&foreign),
      true
    )
    .is_err()
  );
  assert!(owners.is_empty());
}
#[test]
fn recycled_addresses_and_unmapped_clients_invalidate_ownership() {
  let first = client("0x1", "old", 0);
  let mut owners = HashMap::new();
  resolve(
    &mut owners,
    &[first],
    "main",
    "Marklab",
    [900, 700],
    None,
    false,
  )
  .unwrap();
  let mut replacement = client("0x1", "new", 0);
  replacement.title = "Another root".into();
  assert!(
    resolve(
      &mut owners,
      &[replacement],
      "main",
      "Marklab",
      [900, 700],
      None,
      false
    )
    .is_err()
  );
  assert!(owners.is_empty());
  let mut hidden = client("0x2", "hidden", 0);
  hidden.mapped = false;
  assert!(
    resolve(
      &mut owners,
      &[hidden],
      "main",
      "Marklab",
      [900, 700],
      None,
      false
    )
    .is_err()
  );
}

#[tokio::test]
async fn ipc_only_requests_window_metadata_and_rejects_oversized_replies() {
  use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixListener,
  };
  let directory = tempfile::tempdir().unwrap();
  let path = directory.path().join("test.sock");
  let listener = UnixListener::bind(&path).unwrap();
  let server = tokio::spawn(async move {
    let (mut stream, _) = listener.accept().await.unwrap();
    let mut request = String::new();
    stream.read_to_string(&mut request).await.unwrap();
    assert_eq!(request, "j/clients");
    let _ = stream.write_all(&vec![b' '; 1024 * 1024 + 1]).await;
  });
  let result = ipc::read::<Vec<Client>>(&path, Query::Clients).await;
  assert_eq!(result.unwrap_err().code, "WINDOW_COMPOSITOR_UNAVAILABLE");
  server.await.unwrap();
}
