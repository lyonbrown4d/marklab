use super::*;
use futures_util::{StreamExt, stream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
pub(super) async fn bounded_response(
  response: reqwest::Response,
  max: u64,
) -> BackendResult<Vec<u8>> {
  if response.content_length().is_some_and(|size| size > max) {
    return Err(BackendError::new(
      "WEBDAV_TOO_LARGE",
      "Remote response exceeds the supported size",
    ));
  }
  let mut body = Vec::new();
  let mut stream = response.bytes_stream();
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|_| network())?;
    if body.len() as u64 + chunk.len() as u64 > max {
      return Err(BackendError::new(
        "WEBDAV_TOO_LARGE",
        "Remote response exceeds the supported size",
      ));
    }
    body.extend_from_slice(&chunk);
  }
  Ok(body)
}
pub(super) async fn download(
  remote: &DavRemote,
  path: &str,
  destination: &Path,
  max: u64,
) -> BackendResult<RemoteEntry> {
  let response = remote
    .request(reqwest::Method::GET, path)?
    .send()
    .await
    .map_err(|_| network())?;
  check_status(response.status())?;
  if response.content_length().is_some_and(|size| size > max) {
    return Err(BackendError::new(
      "WEBDAV_TOO_LARGE",
      "Remote file exceeds the supported size",
    ));
  }
  let tag = etag(response.headers());
  let modified = response
    .headers()
    .get(reqwest::header::LAST_MODIFIED)
    .and_then(|value| value.to_str().ok())
    .unwrap_or("1970-01-01T00:00:00.000Z")
    .to_string();
  let mut target = tokio::fs::OpenOptions::new()
    .write(true)
    .truncate(true)
    .open(destination)
    .await?;
  let mut stream = response.bytes_stream();
  let mut size = 0;
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|_| network())?;
    size += chunk.len() as u64;
    if size > max {
      return Err(BackendError::new(
        "WEBDAV_TOO_LARGE",
        "Remote file exceeds the supported size",
      ));
    }
    target.write_all(&chunk).await?;
  }
  target.flush().await?;
  target.sync_all().await?;
  Ok(RemoteEntry {
    path: path.into(),
    directory: false,
    size,
    modified_at: modified,
    etag: tag,
  })
}
fn conditional(
  request: reqwest::RequestBuilder,
  condition: Condition,
) -> BackendResult<reqwest::RequestBuilder> {
  if condition.if_match.is_some() && condition.if_none_match {
    return Err(paths::invalid("Conflicting WebDAV write conditions"));
  }
  let mut request = request;
  if let Some(tag) = condition.if_match {
    strong_etag(&tag)?;
    request = request.header(reqwest::header::IF_MATCH, tag);
  }
  if condition.if_none_match {
    request = request.header(reqwest::header::IF_NONE_MATCH, "*");
  }
  Ok(request)
}
pub(super) async fn put_bytes(
  remote: &DavRemote,
  path: &str,
  body: Vec<u8>,
  condition: Condition,
) -> BackendResult<Option<String>> {
  remote.make_parents(path).await?;
  let request = conditional(remote.request(reqwest::Method::PUT, path)?, condition)?
    .header(reqwest::header::CONTENT_LENGTH, body.len())
    .body(body);
  let response = request.send().await.map_err(|_| network())?;
  check_status(response.status())?;
  Ok(etag(response.headers()))
}
pub(super) async fn put_file(
  remote: &DavRemote,
  path: &str,
  source: &Path,
  size: u64,
  condition: Condition,
) -> BackendResult<Option<String>> {
  remote.make_parents(path).await?;
  let file = tokio::fs::File::open(source).await?;
  if file.metadata().await?.len() != size {
    return Err(BackendError::new(
      "LOCAL_FILE_CHANGED",
      "Upload snapshot size changed",
    ));
  }
  let chunks = stream::try_unfold((file, 0u64), move |(mut file, read)| async move {
    let mut buffer = vec![0u8; 64 * 1024];
    let count = file.read(&mut buffer).await?;
    if count == 0 {
      if read != size {
        return Err(std::io::Error::new(
          std::io::ErrorKind::UnexpectedEof,
          "Upload snapshot changed",
        ));
      }
      return Ok(None);
    }
    let next = read + count as u64;
    if next > size {
      return Err(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "Upload snapshot grew",
      ));
    }
    buffer.truncate(count);
    Ok(Some((buffer, (file, next))))
  });
  let request = conditional(remote.request(reqwest::Method::PUT, path)?, condition)?
    .header(reqwest::header::CONTENT_LENGTH, size)
    .body(reqwest::Body::wrap_stream(chunks));
  let response = request.send().await.map_err(|_| network())?;
  check_status(response.status())?;
  Ok(etag(response.headers()))
}
