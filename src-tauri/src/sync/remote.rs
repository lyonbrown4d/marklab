use super::{Profile, paths};
use crate::error::{BackendError, BackendResult};
use std::{collections::HashSet, path::Path, sync::Arc, time::Duration};
use tokio::sync::Mutex;
#[path = "remote_http.rs"]
mod http;
#[path = "remote_xml.rs"]
mod xml;
#[derive(Clone)]
pub struct DavRemote {
  pub(crate) inner: Arc<RemoteInner>,
}
pub(crate) struct RemoteInner {
  pub client: reqwest::Client,
  pub endpoint: url::Url,
  pub base_path: String,
  pub root: String,
  pub username: String,
  pub password: Option<String>,
  pub directories: Mutex<HashSet<String>>,
}
#[derive(Clone, Debug)]
pub struct RemoteEntry {
  pub path: String,
  pub directory: bool,
  pub size: u64,
  pub modified_at: String,
  pub etag: Option<String>,
}
pub struct RemoteBytes {
  pub body: Vec<u8>,
  pub etag: Option<String>,
}
#[derive(Default, Clone)]
pub struct Condition {
  pub if_match: Option<String>,
  pub if_none_match: bool,
}
impl DavRemote {
  pub fn new(profile: &Profile, password: Option<&str>, remote_root: &str) -> BackendResult<Self> {
    let (endpoint, base_path) = paths::validate_endpoint(
      &profile.endpoint,
      profile.allow_insecure_local,
      Some(&profile.base_path),
    )?;
    let root = paths::remote_path(remote_root)?;
    let endpoint =
      url::Url::parse(&endpoint).map_err(|_| paths::invalid("Invalid WebDAV endpoint"))?;
    let client = reqwest::Client::builder()
      .redirect(reqwest::redirect::Policy::none())
      .connect_timeout(Duration::from_secs(10))
      .timeout(Duration::from_secs(120))
      .build()
      .map_err(|_| network())?;
    Ok(Self {
      inner: Arc::new(RemoteInner {
        client,
        endpoint,
        base_path,
        root,
        username: profile.username.clone(),
        password: password.map(String::from),
        directories: Mutex::new(HashSet::new()),
      }),
    })
  }
  pub(crate) fn url(&self, path: &str) -> BackendResult<url::Url> {
    let relative = paths::remote_path(path)?;
    let mut url = self.inner.endpoint.clone();
    {
      let mut segments = url
        .path_segments_mut()
        .map_err(|_| paths::invalid("Invalid WebDAV endpoint"))?;
      segments.clear();
      for part in [&self.inner.base_path, &self.inner.root, &relative] {
        for segment in part.split('/').filter(|segment| !segment.is_empty()) {
          segments.push(segment);
        }
      }
    }
    Ok(url)
  }
  pub(crate) fn request(
    &self,
    method: reqwest::Method,
    path: &str,
  ) -> BackendResult<reqwest::RequestBuilder> {
    Ok(
      self
        .inner
        .client
        .request(method, self.url(path)?)
        .basic_auth(&self.inner.username, self.inner.password.as_ref()),
    )
  }
  pub async fn stat(&self, path: &str) -> BackendResult<RemoteEntry> {
    let mut values = self.propfind(path, "0").await?;
    values
      .pop()
      .ok_or_else(|| BackendError::new("WEBDAV_NOT_FOUND", "WebDAV file was not found"))
  }
  pub async fn list(&self, path: &str) -> BackendResult<Vec<RemoteEntry>> {
    let directory = paths::remote_path(path)?;
    let prefix = if directory.is_empty() {
      String::new()
    } else {
      format!("{directory}/")
    };
    Ok(
      self
        .propfind(path, "1")
        .await?
        .into_iter()
        .filter(|entry| {
          entry.path != directory
            && entry
              .path
              .strip_prefix(&prefix)
              .is_some_and(|rest| !rest.is_empty() && !rest.contains('/'))
        })
        .collect(),
    )
  }
  async fn propfind(&self, path: &str, depth: &str) -> BackendResult<Vec<RemoteEntry>> {
    let method =
      reqwest::Method::from_bytes(b"PROPFIND").map_err(|_| paths::invalid("Invalid DAV method"))?;
    let response=self.request(method,path)?.header("Depth",depth).header("Content-Type","application/xml; charset=utf-8").body("<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop></d:propfind>").send().await.map_err(|_|network())?;
    check_status(response.status())?;
    let body = http::bounded_response(response, 4 * 1024 * 1024).await?;
    xml::parse(self, &body)
  }
  pub async fn get(&self, path: &str, max_bytes: u64) -> BackendResult<RemoteBytes> {
    let response = self
      .request(reqwest::Method::GET, path)?
      .send()
      .await
      .map_err(|_| network())?;
    check_status(response.status())?;
    let etag = etag(response.headers());
    let body = http::bounded_response(response, max_bytes).await?;
    Ok(RemoteBytes { body, etag })
  }
  pub async fn delete(&self, path: &str, if_match: Option<&str>) -> BackendResult<()> {
    let mut request = self.request(reqwest::Method::DELETE, path)?;
    if let Some(etag) = if_match {
      strong_etag(etag)?;
      request = request.header(reqwest::header::IF_MATCH, etag);
    }
    let response = request.send().await.map_err(|_| network())?;
    check_status(response.status())
  }
  pub(crate) async fn make_parents(&self, path: &str) -> BackendResult<()> {
    let relative = paths::remote_path(path)?;
    let mut parent = String::new();
    let all = std::iter::once(self.inner.root.as_str())
      .chain(relative.rsplit_once('/').map(|(parent, _)| parent));
    for part in all {
      for segment in part.split('/').filter(|segment| !segment.is_empty()) {
        if !parent.is_empty() {
          parent.push('/');
        }
        parent.push_str(segment);
        if self.inner.directories.lock().await.contains(&parent) {
          continue;
        }
        // `url` already adds remote root, so MKCOL addresses paths relative to the profile base here.
        let mut url = self.inner.endpoint.clone();
        {
          let mut pieces = url
            .path_segments_mut()
            .map_err(|_| paths::invalid("Invalid remote directory"))?;
          pieces.clear();
          for segment in self
            .inner
            .base_path
            .split('/')
            .chain(parent.split('/'))
            .filter(|segment| !segment.is_empty())
          {
            pieces.push(segment);
          }
        }
        let method = reqwest::Method::from_bytes(b"MKCOL")
          .map_err(|_| paths::invalid("Invalid DAV method"))?;
        let response = self
          .inner
          .client
          .request(method, url)
          .basic_auth(&self.inner.username, self.inner.password.as_ref())
          .send()
          .await
          .map_err(|_| network())?;
        if response.status().as_u16() != 405 {
          check_status(response.status())?;
        }
        self.inner.directories.lock().await.insert(parent.clone());
      }
    }
    Ok(())
  }
  pub async fn download(
    &self,
    path: &str,
    destination: &Path,
    max_bytes: u64,
  ) -> BackendResult<RemoteEntry> {
    http::download(self, path, destination, max_bytes).await
  }
  pub async fn put_bytes(
    &self,
    path: &str,
    body: Vec<u8>,
    condition: Condition,
  ) -> BackendResult<Option<String>> {
    http::put_bytes(self, path, body, condition).await
  }
  pub async fn put_file(
    &self,
    path: &str,
    source: &Path,
    size: u64,
    condition: Condition,
  ) -> BackendResult<Option<String>> {
    http::put_file(self, path, source, size, condition).await
  }
}
pub(crate) fn network() -> BackendError {
  BackendError::new(
    "WEBDAV_NETWORK",
    "WebDAV request failed; check the connection",
  )
}
pub(crate) fn etag(headers: &reqwest::header::HeaderMap) -> Option<String> {
  headers
    .get(reqwest::header::ETAG)
    .and_then(|value| value.to_str().ok())
    .map(String::from)
}
pub fn strong_etag(value: &str) -> BackendResult<()> {
  if value.len() > 2048
    || value.starts_with("W/")
    || !value.starts_with('"')
    || !value.ends_with('"')
    || value.chars().any(char::is_control)
  {
    return Err(BackendError::new(
      "WEBDAV_PRECONDITION_FAILED",
      "WebDAV requires a strong entity tag",
    ));
  }
  Ok(())
}
pub(crate) fn check_status(status: reqwest::StatusCode) -> BackendResult<()> {
  if status.is_success() {
    return Ok(());
  }
  let (code, message) = match status.as_u16() {
    401 => ("WEBDAV_UNAUTHORIZED", "WebDAV authentication failed"),
    403 => ("WEBDAV_FORBIDDEN", "WebDAV access was denied"),
    404 => ("WEBDAV_NOT_FOUND", "WebDAV file was not found"),
    409 | 412 => (
      "WEBDAV_PRECONDITION_FAILED",
      "Remote version changed; sync again",
    ),
    _ => ("WEBDAV_REMOTE_ERROR", "WebDAV server request failed"),
  };
  Err(BackendError::new(code, message))
}
