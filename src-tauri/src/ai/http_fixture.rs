use super::transport::BoundedTransport;
use bytes::Bytes;
use rig_core::http_client::{
  HttpClientExt, LazyBody, MultipartForm, Request, Response, Result, StreamingResponse,
};
use std::{
  sync::{
    Arc,
    atomic::{AtomicBool, AtomicUsize, Ordering},
  },
  time::Duration,
};
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  sync::Mutex,
};

pub(super) struct Reply {
  pub status: u16,
  pub body: Vec<u8>,
  pub delay_body: Duration,
  pub headers: &'static str,
}
impl Reply {
  pub fn json(value: serde_json::Value) -> Self {
    Self {
      status: 200,
      body: value.to_string().into_bytes(),
      delay_body: Duration::ZERO,
      headers: "",
    }
  }
}
pub(super) struct Fixture {
  pub transport: Mapped,
  pub requests: Arc<Mutex<Vec<Request<Bytes>>>>,
  pub disconnected: Arc<AtomicBool>,
  pub waiting_body: Arc<AtomicBool>,
  pub received: Arc<AtomicUsize>,
  task: tokio::task::JoinHandle<()>,
}
impl Drop for Fixture {
  fn drop(&mut self) {
    self.task.abort();
  }
}
impl Fixture {
  pub fn base_url(&self) -> String {
    self.transport.base.clone()
  }
  pub async fn new(replies: Vec<Reply>) -> Self {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let disconnected = Arc::new(AtomicBool::new(false));
    let closed = disconnected.clone();
    let waiting_body = Arc::new(AtomicBool::new(false));
    let waiting = waiting_body.clone();
    let received = Arc::new(AtomicUsize::new(0));
    let count = received.clone();
    let task = tokio::spawn(async move {
      for reply in replies {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let header_end = loop {
          let mut buffer = [0; 4096];
          let read = socket.read(&mut buffer).await.unwrap();
          if read == 0 {
            return;
          }
          request.extend_from_slice(&buffer[..read]);
          if let Some(at) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
            break at + 4;
          }
          assert!(request.len() < 64 * 1024);
        };
        let headers = String::from_utf8_lossy(&request[..header_end]);
        let length = headers
          .lines()
          .find_map(|line| {
            let (key, value) = line.split_once(':')?;
            key
              .eq_ignore_ascii_case("content-length")
              .then(|| value.trim().parse::<usize>().unwrap())
          })
          .unwrap_or(0);
        while request.len() < header_end + length {
          let mut buffer = [0; 4096];
          let read = socket.read(&mut buffer).await.unwrap();
          if read == 0 {
            return;
          }
          request.extend_from_slice(&buffer[..read]);
        }
        count.fetch_add(1, Ordering::AcqRel);
        // No Content-Length: the transport must count actual streamed bytes,
        // including errors, instead of trusting advertised lengths.
        let header = format!(
          "HTTP/1.1 {} Fixture\r\nContent-Type: application/json\r\nConnection: close\r\n{}\r\n",
          reply.status, reply.headers
        );
        if socket.write_all(header.as_bytes()).await.is_err() {
          continue;
        }
        if !reply.delay_body.is_zero() {
          waiting.store(true, Ordering::Release);
          let mut byte = [0; 1];
          tokio::select! {
              _ = tokio::time::sleep(reply.delay_body) => {},
              result = socket.read(&mut byte) => {
                  if matches!(result, Ok(0)) { closed.store(true, Ordering::Release); }
                  continue;
              }
          }
        }
        let _ = socket.write_all(&reply.body).await;
      }
    });
    Self {
      transport: Mapped {
        inner: BoundedTransport::new(
          reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap(),
        ),
        base,
        requests: requests.clone(),
      },
      requests,
      disconnected,
      waiting_body,
      received,
      task,
    }
  }
}
#[derive(Clone)]
pub(super) struct Mapped {
  pub inner: BoundedTransport,
  base: String,
  requests: Arc<Mutex<Vec<Request<Bytes>>>>,
}
impl HttpClientExt for Mapped {
  fn send<T, U>(
    &self,
    request: Request<T>,
  ) -> impl Future<Output = Result<Response<LazyBody<U>>>> + Send + 'static
  where
    T: Into<Bytes> + Send,
    U: From<Bytes> + Send + 'static,
  {
    let (mut parts, body) = request.into_parts();
    let body = body.into();
    let saved = Request::from_parts(parts.clone(), body.clone());
    parts.uri = format!(
      "{}{}",
      self.base,
      parts
        .uri
        .path_and_query()
        .map(|path| path.as_str())
        .unwrap_or("/")
    )
    .parse()
    .unwrap();
    let mapped = Request::from_parts(parts, body);
    let this = self.clone();
    async move {
      this.requests.lock().await.push(saved);
      this.inner.send(mapped).await
    }
  }
  fn send_multipart<U>(
    &self,
    request: Request<MultipartForm>,
  ) -> impl Future<Output = Result<Response<LazyBody<U>>>> + Send + 'static
  where
    U: From<Bytes> + Send + 'static,
  {
    self.inner.send_multipart(request)
  }
  async fn send_streaming<T>(&self, request: Request<T>) -> Result<StreamingResponse>
  where
    T: Into<Bytes> + Send,
  {
    let response = self.send::<T, Bytes>(request).await?;
    let (parts, body) = response.into_parts();
    let bytes = body.await?;
    Ok(Response::from_parts(
      parts,
      Box::pin(futures_util::stream::once(async move { Ok(bytes) }))
        as rig_core::http_client::BoxedStream,
    ))
  }
}
