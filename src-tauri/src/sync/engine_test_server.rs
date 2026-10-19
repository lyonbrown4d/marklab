use std::{
  collections::{BTreeMap, BTreeSet},
  sync::Arc,
};
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  sync::Mutex,
};
#[derive(Default)]
struct Store {
  files: BTreeMap<String, (Vec<u8>, u64)>,
  directories: BTreeSet<String>,
  revision: u64,
}
pub struct Server {
  pub endpoint: String,
  store: Arc<Mutex<Store>>,
  task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
  fn drop(&mut self) {
    self.task.abort();
  }
}
impl Server {
  pub async fn new() -> Self {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let store = Arc::new(Mutex::new(Store::default()));
    store
      .lock()
      .await
      .directories
      .extend(["/".into(), "/notes".into()]);
    let shared = store.clone();
    let task = tokio::spawn(async move {
      while let Ok((mut stream, _)) = listener.accept().await {
        let shared = shared.clone();
        tokio::spawn(async move {
          let _ = handle(&mut stream, shared).await;
        });
      }
    });
    Self {
      endpoint,
      store,
      task,
    }
  }
  pub async fn put(&self, path: &str, bytes: Vec<u8>) {
    let mut store = self.store.lock().await;
    store.revision += 1;
    let revision = store.revision;
    store.files.insert(path.into(), (bytes, revision));
  }
  pub async fn get(&self, path: &str) -> Option<Vec<u8>> {
    self
      .store
      .lock()
      .await
      .files
      .get(path)
      .map(|(v, _)| v.clone())
  }
}
async fn handle(
  stream: &mut tokio::net::TcpStream,
  shared: Arc<Mutex<Store>>,
) -> std::io::Result<()> {
  let mut buffer = Vec::new();
  let end = loop {
    let mut chunk = [0u8; 4096];
    let count = stream.read(&mut chunk).await?;
    if count == 0 {
      return Ok(());
    }
    buffer.extend_from_slice(&chunk[..count]);
    if let Some(index) = buffer.windows(4).position(|v| v == b"\r\n\r\n") {
      break index + 4;
    }
    if buffer.len() > 1024 * 1024 {
      return Ok(());
    }
  };
  let header = String::from_utf8_lossy(&buffer[..end]).to_string();
  let mut request = header.lines().next().unwrap_or("").split_whitespace();
  let method = request.next().unwrap_or("");
  let path = request.next().unwrap_or("/").trim_end_matches('/');
  let path = if path.is_empty() { "/" } else { path };
  let headers: BTreeMap<_, _> = header
    .lines()
    .skip(1)
    .filter_map(|line| line.split_once(':'))
    .map(|(key, value)| (key.to_ascii_lowercase(), value.trim().to_owned()))
    .collect();
  let length = headers
    .get("content-length")
    .and_then(|v| v.parse::<usize>().ok())
    .unwrap_or(0);
  while buffer.len() < end + length {
    let mut chunk = [0u8; 8192];
    let count = stream.read(&mut chunk).await?;
    if count == 0 {
      break;
    }
    buffer.extend_from_slice(&chunk[..count]);
  }
  let mut store = shared.lock().await;
  let mut status = 200;
  let mut body = Vec::new();
  let mut etag = None;
  match method {
    "GET" | "HEAD" => {
      if let Some((bytes, revision)) = store.files.get(path) {
        body = bytes.clone();
        etag = Some(format!("\"{revision}\""));
      } else {
        status = 404;
      }
    }
    "MKCOL" => {
      if store.directories.contains(path) {
        status = 405;
      } else {
        store.directories.insert(path.into());
        status = 201;
      }
    }
    "PUT" => {
      let current = store
        .files
        .get(path)
        .map(|(_, revision)| format!("\"{revision}\""));
      if headers
        .get("if-match")
        .is_some_and(|value| Some(value) != current.as_ref())
        || headers
          .get("if-none-match")
          .is_some_and(|v| v == "*" && current.is_some())
      {
        status = 412;
      } else {
        store.revision += 1;
        let revision = store.revision;
        store
          .files
          .insert(path.into(), (buffer[end..end + length].into(), revision));
        etag = Some(format!("\"{revision}\""));
        status = 201;
      }
    }
    "DELETE" => {
      if store.files.remove(path).is_some() {
        status = 204;
      } else {
        status = 404;
      }
    }
    "PROPFIND" => {
      if !store.directories.contains(path) && !store.files.contains_key(path) {
        status = 404;
      } else {
        status = 207;
        let depth = headers.get("depth").map(String::as_str).unwrap_or("0");
        let mut entries = vec![path.to_owned()];
        if depth == "1" {
          let prefix = if path == "/" {
            "/".to_owned()
          } else {
            format!("{path}/")
          };
          entries.extend(
            store
              .directories
              .iter()
              .chain(store.files.keys())
              .filter(|item| {
                item.starts_with(&prefix)
                  && item.len() > prefix.len()
                  && !item[prefix.len()..].contains('/')
              })
              .cloned(),
          );
        }
        let mut xml = "<?xml version=\"1.0\"?><d:multistatus xmlns:d=\"DAV:\">".to_owned();
        for item in entries {
          let directory = store.directories.contains(&item);
          let size = store.files.get(&item).map(|(v, _)| v.len()).unwrap_or(0);
          let tag = store
            .files
            .get(&item)
            .map(|(_, r)| format!("\"{r}\""))
            .unwrap_or_default();
          let collection = if directory { "<d:collection/>" } else { "" };
          xml.push_str(&format!("<d:response><d:href>{item}</d:href><d:propstat><d:prop><d:resourcetype>{collection}</d:resourcetype><d:getcontentlength>{size}</d:getcontentlength><d:getlastmodified>Sat, 17 Oct 2026 00:00:00 GMT</d:getlastmodified><d:getetag>{tag}</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>"));
        }
        xml.push_str("</d:multistatus>");
        body = xml.into_bytes();
      }
    }
    _ => status = 405,
  }
  drop(store);
  let reason = match status {
    200 => "OK",
    201 => "Created",
    204 => "No Content",
    207 => "Multi-Status",
    404 => "Not Found",
    405 => "Method Not Allowed",
    412 => "Precondition Failed",
    _ => "Error",
  };
  let tag = etag.map(|v| format!("ETag: {v}\r\n")).unwrap_or_default();
  let response = format!(
    "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nContent-Type: application/xml\r\n{tag}Connection: close\r\n\r\n",
    body.len()
  );
  stream.write_all(response.as_bytes()).await?;
  if method != "HEAD" {
    stream.write_all(&body).await?;
  }
  stream.shutdown().await
}
