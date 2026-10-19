//! A byte budget around Rig's transport contract; provider encoding stays in Rig.
use bytes::Bytes;
use futures_util::{StreamExt, stream};
use rig_core::http_client::{
  BoxedStream, Error, HttpClientExt, LazyBody, MultipartForm, Request, Response, Result,
  StreamingResponse,
};
use std::sync::{
  Arc,
  atomic::{AtomicBool, Ordering},
};

pub(super) const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone)]
pub(super) struct BoundedTransport {
  client: reqwest::Client,
  pub(super) exceeded: Arc<AtomicBool>,
}
impl BoundedTransport {
  pub(super) fn new(client: reqwest::Client) -> Self {
    Self {
      client,
      exceeded: Arc::new(AtomicBool::new(false)),
    }
  }
  // Keep Rig's transport error intact at its adapter boundary instead of allocating
  // a box here and immediately removing it in each required SDK trait method.
  #[allow(clippy::result_large_err)]
  async fn response(&self, builder: reqwest::RequestBuilder) -> Result<Response<Bytes>> {
    self
      .read_response(builder.send().await.map_err(Error::instance)?)
      .await
  }
  // This helper returns the SDK's fixed HttpClientExt error type (128 bytes).
  #[allow(clippy::result_large_err)]
  async fn read_response(&self, response: reqwest::Response) -> Result<Response<Bytes>> {
    let status = response.status();
    let headers = response.headers().clone();
    let mut bytes = Vec::new();
    let mut chunks = response.bytes_stream();
    while let Some(chunk) = chunks.next().await {
      let chunk = chunk.map_err(Error::instance)?;
      if chunk.len() > MAX_RESPONSE_BYTES.saturating_sub(bytes.len()) {
        self.exceeded.store(true, Ordering::Release);
        return Err(Error::instance(std::io::Error::other(
          "AI response exceeds byte budget",
        )));
      }
      bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
      return Err(Error::non_success_with_details(
        status,
        headers,
        String::from_utf8_lossy(&bytes).into_owned(),
      ));
    }
    let mut response = Response::new(Bytes::from(bytes));
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    Ok(response)
  }
}
impl HttpClientExt for BoundedTransport {
  fn send<T, U>(
    &self,
    request: Request<T>,
  ) -> impl Future<Output = Result<Response<LazyBody<U>>>> + Send + 'static
  where
    T: Into<Bytes> + Send,
    U: From<Bytes> + Send + 'static,
  {
    // Convert before the future: the SDK contract deliberately does not require T:'static.
    let (parts, body) = request.into_parts();
    let builder = self
      .client
      .request(parts.method, parts.uri.to_string())
      .headers(parts.headers)
      .body(body.into());
    let transport = self.clone();
    async move {
      Ok(
        transport
          .response(builder)
          .await?
          .map(|bytes| Box::pin(async move { Ok(U::from(bytes)) }) as LazyBody<U>),
      )
    }
  }
  fn send_multipart<U>(
    &self,
    request: Request<MultipartForm>,
  ) -> impl Future<Output = Result<Response<LazyBody<U>>>> + Send + 'static
  where
    U: From<Bytes> + Send + 'static,
  {
    let (parts, form) = request.into_parts();
    let form = rig_reqwest::multipart_form(form);
    let client = self.client.clone();
    let transport = self.clone();
    async move {
      let form = form.map_err(Error::instance)?;
      let builder = client
        .request(parts.method, parts.uri.to_string())
        .headers(parts.headers)
        .multipart(form);
      Ok(
        transport
          .response(builder)
          .await?
          .map(|bytes| Box::pin(async move { Ok(U::from(bytes)) }) as LazyBody<U>),
      )
    }
  }
  async fn send_streaming<T>(&self, request: Request<T>) -> Result<StreamingResponse>
  where
    T: Into<Bytes> + Send,
  {
    let (parts, body) = request.into_parts();
    let response = self
      .client
      .request(parts.method, parts.uri.to_string())
      .headers(parts.headers)
      .body(body.into())
      .send()
      .await
      .map_err(Error::instance)?;
    if !response.status().is_success() {
      // Error envelopes have the same budget as successful streamed bodies.
      return Ok(
        self
          .read_response(response)
          .await?
          .map(|bytes| Box::pin(stream::once(async move { Ok(bytes) })) as BoxedStream),
      );
    }
    let mut result = Response::new(());
    *result.status_mut() = response.status();
    *result.headers_mut() = response.headers().clone();
    let exceeded = self.exceeded.clone();
    let chunks = response
      .bytes_stream()
      .scan((0usize, false), move |(total, done), chunk| {
        let result = if *done {
          None
        } else {
          Some(match chunk {
            Ok(chunk) if chunk.len() <= MAX_RESPONSE_BYTES.saturating_sub(*total) => {
              *total += chunk.len();
              Ok(chunk)
            }
            Ok(_) => {
              *done = true;
              exceeded.store(true, Ordering::Release);
              Err(Error::instance(std::io::Error::other(
                "AI response exceeds byte budget",
              )))
            }
            Err(error) => {
              *done = true;
              Err(Error::instance(error))
            }
          })
        };
        std::future::ready(result)
      });
    Ok(result.map(|()| Box::pin(chunks) as BoxedStream))
  }
}
