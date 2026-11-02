use super::{
  lfs_endpoint::{Context, error, validate_url},
  lfs_transfer::authentication_error,
};
use crate::error::{BackendError, BackendResult};
use futures_util::StreamExt;
use git_lfs_api::{Action, ObjectResult, ObjectSpec, Operation};
use git_lfs_pointer::Pointer;
use git_lfs_store::{Store, StoreError};
use reqwest_lfs::{
  Method, RequestBuilder, Response,
  header::{HeaderName, HeaderValue},
};
use std::{
  fs::File,
  io::{self, Read},
  time::{Duration, SystemTime},
};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::{ReaderStream, StreamReader, SyncIoBridge};

pub(super) fn validate_action(action: &Action) -> BackendResult<()> {
  validate_url(&action.href)?;
  if action.is_expired_within(SystemTime::now(), Duration::from_secs(5)) {
    return Err(error(
      "A Git LFS transfer action expired; retry to request a new action",
    ));
  }
  for (name, value) in &action.header {
    let name = HeaderName::from_bytes(name.as_bytes())
      .map_err(|_| error("The Git LFS server returned an invalid action header"))?;
    if matches!(
      name.as_str(),
      "content-length" | "transfer-encoding" | "host"
    ) || HeaderValue::from_str(value).is_err()
    {
      return Err(error("The Git LFS server returned an unsafe action header"));
    }
  }
  Ok(())
}

fn request(
  context: &Context,
  object: &ObjectResult,
  action: &Action,
  method: Method,
) -> BackendResult<RequestBuilder> {
  validate_action(action)?;
  let url = validate_url(&action.href)?;
  let mut request = context.http.request(method, url.clone());
  let has_auth = action
    .header
    .keys()
    .any(|name| name.eq_ignore_ascii_case("authorization"));
  for (name, value) in &action.header {
    let mut value = HeaderValue::from_str(value)
      .map_err(|_| error("The Git LFS server returned an invalid action header"))?;
    value.set_sensitive(true);
    request = request.header(name, value);
  }
  // Batch authentication is reused only for the same origin when the server
  // has not marked the action authenticated and has supplied no Authorization.
  if object.authenticated != Some(true)
    && !has_auth
    && url.origin().ascii_serialization() == context.origin
    && let Some((username, password)) = &context.credentials
  {
    request = request.basic_auth(username, Some(password));
  }
  Ok(request)
}

fn retryable() -> BackendError {
  super::process::error(
    "git_lfs_retryable",
    "Git LFS transport was interrupted; retry the transfer",
  )
}

async fn send(request: RequestBuilder) -> BackendResult<Response> {
  let response = request.send().await.map_err(|_| retryable())?;
  let status = response.status();
  match status.as_u16() {
    200..=299 => Ok(response),
    401 | 403 => Err(authentication_error()),
    408 | 429 | 500..=599 => Err(retryable()),
    _ => Err(error("The Git LFS server rejected an object transfer")),
  }
}

struct ExactReader<R> {
  source: R,
  expected: u64,
  received: u64,
}
impl<R: Read> Read for ExactReader<R> {
  fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
    if buffer.is_empty() {
      return Ok(0);
    }
    let limit = self
      .expected
      .saturating_sub(self.received)
      .saturating_add(1)
      .min(buffer.len() as u64) as usize;
    let count = self.source.read(&mut buffer[..limit])?;
    self.received = self
      .received
      .checked_add(count as u64)
      .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidData))?;
    if self.received > self.expected || (count == 0 && self.received != self.expected) {
      return Err(io::Error::from(io::ErrorKind::InvalidData));
    }
    Ok(count)
  }
}

async fn download(
  context: &Context,
  store: Store,
  object: &ObjectResult,
  pointer: &Pointer,
) -> BackendResult<()> {
  let action = object
    .actions
    .as_ref()
    .and_then(|actions| actions.download.as_ref())
    .ok_or_else(|| error("The Git LFS server omitted a download action"))?;
  let response = send(request(context, object, action, Method::GET)?).await?;
  if response
    .content_length()
    .is_some_and(|size| size != pointer.size)
  {
    return Err(error(
      "The Git LFS download size does not match its pointer",
    ));
  }
  let stream = response
    .bytes_stream()
    .map(|chunk| chunk.map_err(|_| io::Error::other("Git LFS response body interrupted")));
  let bridge = SyncIoBridge::new(StreamReader::new(stream));
  let pointer = pointer.clone();
  tokio::task::spawn_blocking(move || {
    super::lfs::object_path(&store, pointer.oid)?;
    let mut reader = ExactReader {
      source: bridge,
      expected: pointer.size,
      received: 0,
    };
    store
      .insert_verified(pointer.oid, &mut reader)
      .map_err(|failure| match failure {
        StoreError::Io(failure) if failure.kind() != io::ErrorKind::InvalidData => retryable(),
        _ => error("The Git LFS download checksum or size does not match its pointer"),
      })?;
    Ok(())
  })
  .await
  .map_err(|_| error("The Git LFS download worker could not finish"))?
}

async fn upload(
  context: &Context,
  object: &ObjectResult,
  pointer: &Pointer,
  file: Option<&File>,
) -> BackendResult<()> {
  let Some(action) = object
    .actions
    .as_ref()
    .and_then(|actions| actions.upload.as_ref())
  else {
    return Ok(());
  };
  let source = file
    .ok_or_else(|| error("A required Git LFS object is missing locally"))?
    .try_clone()?;
  let mut source = tokio::fs::File::from_std(source);
  source.rewind().await?;
  let body = reqwest_lfs::Body::wrap_stream(ReaderStream::new(source.take(pointer.size)));
  send(
    request(context, object, action, Method::PUT)?
      .header(reqwest_lfs::header::CONTENT_LENGTH, pointer.size)
      .body(body),
  )
  .await?;
  if let Some(action) = object
    .actions
    .as_ref()
    .and_then(|actions| actions.verify.as_ref())
  {
    let mut verification = request(context, object, action, Method::POST)?;
    if !action
      .header
      .keys()
      .any(|name| name.eq_ignore_ascii_case("content-type"))
    {
      verification = verification.header(
        reqwest_lfs::header::CONTENT_TYPE,
        "application/vnd.git-lfs+json",
      );
    }
    send(verification.json(&ObjectSpec {
      oid: object.oid.clone(),
      size: pointer.size,
    }))
    .await?;
  }
  Ok(())
}

pub(super) async fn transfer(
  context: &Context,
  store: Store,
  object: ObjectResult,
  pointer: Pointer,
  file: Option<File>,
  operation: Operation,
) -> BackendResult<()> {
  for attempt in 0..2 {
    let result = match operation {
      Operation::Download => download(context, store.clone(), &object, &pointer).await,
      Operation::Upload => upload(context, &object, &pointer, file.as_ref()).await,
    };
    match result {
      Err(value) if value.code == "git_lfs_retryable" && attempt == 0 => {
        tokio::time::sleep(Duration::from_secs(1)).await
      }
      Err(value) if value.code == "git_lfs_retryable" => {
        return Err(error(
          "Git LFS transfer failed after retrying; check the network connection and endpoint",
        ));
      }
      other => return other,
    }
  }
  Err(error("Git LFS transfer failed"))
}

#[cfg(test)]
pub(super) fn action_request(
  context: &Context,
  object: &ObjectResult,
  action: &Action,
) -> reqwest_lfs::Request {
  request(context, object, action, Method::GET)
    .unwrap()
    .build()
    .unwrap()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn wrong_download_size_cannot_publish_a_verified_hash() {
    for expected in [6, 8] {
      let directory = tempfile::tempdir().unwrap();
      let store = Store::new(directory.path());
      let (oid, _) = super::super::lfs::digest(&mut &b"payload"[..]).unwrap();
      let mut source = ExactReader {
        source: &b"payload"[..],
        expected,
        received: 0,
      };
      assert!(store.insert_verified(oid, &mut source).is_err());
      assert!(!store.object_path(oid).exists());
    }
  }
}
