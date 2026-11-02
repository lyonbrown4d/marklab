use super::{lfs, lfs_network, local, process, remote, test_support::Repository, types};
use git_lfs_pointer::Pointer;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
  io::{BufRead, BufReader, Cursor, Read, Write},
  net::{TcpListener, TcpStream},
  thread::{self, JoinHandle},
  time::{Duration, Instant},
};

const CONTENT: &[u8] = b"network\0LFS\xffpayload\n";

struct Request {
  line: String,
  body: Vec<u8>,
  content_type: Option<String>,
}

fn read_request(stream: &mut TcpStream) -> Request {
  stream
    .set_read_timeout(Some(Duration::from_secs(5)))
    .unwrap();
  stream
    .set_write_timeout(Some(Duration::from_secs(5)))
    .unwrap();
  let mut reader = BufReader::new(stream);
  let mut line = String::new();
  reader.read_line(&mut line).unwrap();
  let mut length = 0;
  let mut content_type = None;
  loop {
    let mut header = String::new();
    reader.read_line(&mut header).unwrap();
    assert!(!header.is_empty(), "request ended before headers");
    if header == "\r\n" {
      break;
    }
    if let Some((name, value)) = header.split_once(':') {
      if name.eq_ignore_ascii_case("content-length") {
        length = value.trim().parse::<usize>().unwrap();
      }
      if name.eq_ignore_ascii_case("content-type") {
        content_type = Some(value.trim().to_owned());
      }
    }
  }
  assert!(length < 64 * 1024);
  let mut body = vec![0; length];
  reader.read_exact(&mut body).unwrap();
  Request {
    line,
    body,
    content_type,
  }
}

fn server(
  responses: impl FnOnce(&str) -> Vec<(u16, Vec<u8>)>,
) -> (String, JoinHandle<Vec<Request>>) {
  let listener = TcpListener::bind("127.0.0.1:0").unwrap();
  listener.set_nonblocking(true).unwrap();
  let endpoint = format!("http://{}/", listener.local_addr().unwrap());
  let responses = responses(&endpoint);
  let handle = thread::spawn(move || {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut requests = Vec::new();
    for (status, body) in responses {
      let mut stream = loop {
        match listener.accept() {
          Ok((stream, _)) => break stream,
          Err(value) if value.kind() == std::io::ErrorKind::WouldBlock => {
            assert!(Instant::now() < deadline, "LFS request did not arrive");
            thread::sleep(Duration::from_millis(5));
          }
          Err(value) => panic!("loopback accept failed: {value}"),
        }
      };
      requests.push(read_request(&mut stream));
      write!(stream, "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nContent-Type: application/vnd.git-lfs+json\r\nConnection: close\r\n\r\n", body.len()).unwrap();
      stream.write_all(&body).unwrap();
    }
    requests
  });
  (endpoint, handle)
}

async fn configure(repo: &Repository, endpoint: String) {
  process::repository(repo.root(), move |repository| {
    let mut config = repository.config()?;
    config.set_str("lfs.url", &endpoint)?;
    config.set_str("filter.lfs.clean", "git-lfs clean -- %f")?;
    config.set_str("filter.lfs.smudge", "git-lfs smudge -- %f")?;
    config.set_str("filter.lfs.process", "git-lfs filter-process")?;
    config.set_bool("filter.lfs.required", true)?;
    Ok(())
  })
  .await
  .unwrap();
  std::fs::write(
    repo.root().join(".gitattributes"),
    "*.bin filter=lfs -text\n",
  )
  .unwrap();
}

fn pointer(repo: &Repository, bytes: &[u8]) -> Pointer {
  let mut encoded = Vec::new();
  lfs::clean(repo.root(), &mut Cursor::new(bytes), &mut encoded).unwrap();
  Pointer::parse(&encoded).unwrap()
}

fn batch(pointer: &Pointer, endpoint: &str, action: &str) -> Vec<u8> {
  let mut response = json!({
    "transfer": "basic",
    "objects": [{ "oid": pointer.oid.to_string(), "size": pointer.size,
      "actions": {(action): {"href": format!("{endpoint}payload")}} }]
  });
  if action == "upload" {
    response["objects"][0]["actions"]["verify"] = json!({"href": format!("{endpoint}verify")});
  }
  serde_json::to_vec(&response).unwrap()
}

fn assert_batch(request: &Request, operation: &str, pointer: &Pointer) {
  assert!(request.line.starts_with("POST /objects/batch "));
  let body: Value = serde_json::from_slice(&request.body).unwrap();
  assert_eq!(body["operation"], operation);
  assert_eq!(
    body["objects"],
    json!([{
      "oid": pointer.oid.to_string(), "size": pointer.size
    }])
  );
}

#[tokio::test]
async fn lfs_uploads_outgoing_history_and_downloads_verified_payload() {
  let repo = Repository::new().await;
  configure(&repo, "http://127.0.0.1:1/".into()).await;
  let old = pointer(&repo, b"already on remote\0");
  std::fs::write(repo.root().join("old.bin"), b"already on remote\0").unwrap();
  local::commit(repo.root(), "remote baseline", true)
    .await
    .unwrap();
  process::repository(repo.root(), |repository| {
    let head = repository.head()?.peel_to_commit()?.id();
    repository.reference("refs/remotes/origin/main", head, true, "fixture")?;
    Ok(())
  })
  .await
  .unwrap();
  std::fs::remove_file(repo.root().join("old.bin")).unwrap();
  local::commit(repo.root(), "remove remote asset", true)
    .await
    .unwrap();
  std::fs::remove_file(lfs::object_path(&lfs::store(repo.root()).unwrap(), old.oid).unwrap())
    .unwrap();
  let asset = pointer(&repo, CONTENT);
  std::fs::write(repo.root().join("asset.bin"), CONTENT).unwrap();
  local::commit(repo.root(), "outgoing asset", true)
    .await
    .unwrap();
  std::fs::remove_file(repo.root().join("asset.bin")).unwrap();
  local::commit(repo.root(), "remove outgoing asset at HEAD", true)
    .await
    .unwrap();
  let (endpoint, handle) = server(|endpoint| {
    vec![
      (200, batch(&asset, endpoint, "upload")),
      (200, Vec::new()),
      (200, b"{}".to_vec()),
      (200, batch(&asset, endpoint, "download")),
      (200, CONTENT.to_vec()),
    ]
  });
  configure(&repo, endpoint).await;
  process::repository(repo.root(), |repository| {
    lfs_network::upload(
      repository,
      "origin",
      repository.head()?.peel_to_commit()?.id(),
    )
  })
  .await
  .unwrap();
  let object = lfs::object_path(&lfs::store(repo.root()).unwrap(), asset.oid).unwrap();
  std::fs::remove_file(&object).unwrap();
  let root = repo.root().to_owned();
  let download = asset.clone();
  crate::blocking::run(move || lfs_network::fetch_missing(&root, &download))
    .await
    .unwrap();
  let downloaded = std::fs::read(object).unwrap();
  assert_eq!(downloaded, CONTENT);
  assert_eq!(
    hex::encode(Sha256::digest(&downloaded)),
    asset.oid.to_string()
  );
  let requests = handle.join().unwrap();
  assert_batch(&requests[0], "upload", &asset);
  assert!(requests[1].line.starts_with("PUT /payload "));
  assert_eq!(requests[1].body, CONTENT);
  assert!(requests[2].line.starts_with("POST /verify "));
  assert_eq!(
    requests[2].content_type.as_deref(),
    Some("application/vnd.git-lfs+json")
  );
  let verification: Value = serde_json::from_slice(&requests[2].body).unwrap();
  assert_eq!(
    verification,
    json!({"oid": asset.oid.to_string(), "size": asset.size})
  );
  assert_batch(&requests[3], "download", &asset);
  assert!(requests[4].line.starts_with("GET /payload "));
}

#[tokio::test]
async fn lfs_batch_failure_prevents_git_remote_reference_update() {
  let repo = Repository::new().await;
  repo.commit("baseline\n").await;
  let directory = tempfile::tempdir().unwrap();
  let bare = git2::Repository::init_bare(directory.path()).unwrap();
  let path = directory.path().to_string_lossy().into_owned();
  process::repository(repo.root(), move |repository| {
    repository.remote("origin", &path)?;
    Ok(())
  })
  .await
  .unwrap();
  let push = types::NetworkRequest {
    expected_root: None,
    remote: Some("origin".into()),
    set_upstream: Some(true),
  };
  remote::network(repo.root(), &push, "push").await.unwrap();
  let before = bare.refname_to_id("refs/heads/main").unwrap();
  let (endpoint, handle) = server(|_| vec![(422, b"{}".to_vec())]);
  configure(&repo, endpoint).await;
  std::fs::write(repo.root().join("asset.bin"), CONTENT).unwrap();
  local::commit(repo.root(), "LFS change", true)
    .await
    .unwrap();
  let error = remote::network(repo.root(), &push, "push")
    .await
    .err()
    .unwrap();
  assert_eq!(error.code, "git_lfs_failed");
  assert_eq!(bare.refname_to_id("refs/heads/main").unwrap(), before);
  let requests = handle.join().unwrap();
  assert_batch(&requests[0], "upload", &pointer(&repo, CONTENT));
}
