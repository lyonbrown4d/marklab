use crate::error::{BackendError, BackendResult};
use futures_util::StreamExt;
use std::{
  net::{IpAddr, SocketAddr},
  time::Duration,
};
use url::Url;
pub const HTML_LIMIT: usize = 256 * 1024;
pub const IMAGE_LIMIT: usize = 8 * 1024 * 1024;
pub fn failure(message: &str) -> BackendError {
  BackendError::new("LINK_PREVIEW_ERROR", message)
}
pub fn normalize(value: &str) -> BackendResult<Url> {
  if value.len() > 4096 || value.chars().any(char::is_control) {
    return Err(failure("Invalid preview URL"));
  }
  let url = Url::parse(value.trim()).map_err(|_| failure("Preview URL must be absolute"))?;
  if !["http", "https"].contains(&url.scheme())
    || url.host_str().is_none()
    || !url.username().is_empty()
    || url.password().is_some()
  {
    return Err(failure(
      "Preview requires an HTTP(S) URL without credentials",
    ));
  }
  Ok(url)
}
pub fn public(address: IpAddr) -> bool {
  match address {
    IpAddr::V4(ip) => {
      let [a, b, c, _] = ip.octets();
      !(a == 0
        || a == 10
        || a == 127
        || a >= 224
        || a == 100 && (64..=127).contains(&b)
        || a == 169 && b == 254
        || a == 172 && (16..=31).contains(&b)
        || a == 192 && (b == 168 || b == 0 && (c == 0 || c == 2) || b == 88 && c == 99)
        || a == 198 && (b == 18 || b == 19 || b == 51 && c == 100)
        || a == 203 && b == 0 && c == 113)
    }
    IpAddr::V6(ip) => {
      let segments = ip.segments();
      (segments[0] & 0xe000) == 0x2000
        && segments[0] != 0x2002
        && !(segments[0] == 0x2001 && (segments[1] < 0x200 || segments[1] == 0xdb8))
        && !(segments[0] == 0x3fff && (segments[1] & 0xf000) == 0)
    }
  }
}
async fn addresses(url: &Url) -> BackendResult<Vec<SocketAddr>> {
  let host = url
    .host_str()
    .ok_or_else(|| failure("Preview URL has no hostname"))?
    .trim_matches(['[', ']']);
  let port = url
    .port_or_known_default()
    .ok_or_else(|| failure("Unsupported preview port"))?;
  let addresses = if let Ok(ip) = host.parse::<IpAddr>() {
    vec![SocketAddr::new(ip, port)]
  } else {
    tokio::net::lookup_host((host, port))
      .await
      .map_err(|_| failure("Preview hostname did not resolve"))?
      .collect()
  };
  if addresses.is_empty() || addresses.iter().any(|v| !public(v.ip())) {
    return Err(failure("Preview target must use a public internet address"));
  }
  Ok(addresses)
}
pub struct Response {
  pub url: Url,
  pub mime: String,
  pub bytes: Vec<u8>,
}
pub async fn fetch(url: Url) -> BackendResult<Response> {
  tokio::time::timeout(Duration::from_secs(5), fetch_inner(url))
    .await
    .map_err(|_| failure("Link preview request timed out"))?
}
async fn fetch_inner(mut url: Url) -> BackendResult<Response> {
  for redirects in 0..=5 {
    let resolved = addresses(&url).await?;
    let host = url
      .host_str()
      .ok_or_else(|| failure("Preview URL has no hostname"))?
      .trim_matches(['[', ']']);
    let client = reqwest::Client::builder()
      .no_proxy()
      .redirect(reqwest::redirect::Policy::none())
      .resolve_to_addrs(host, &resolved)
      .timeout(Duration::from_secs(5))
      .build()
      .map_err(|_| failure("Cannot create preview HTTP client"))?;
    let response=client.get(url.clone()).header(reqwest::header::USER_AGENT,"Marklab/0.2 link-preview").header(reqwest::header::ACCEPT,"text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1").send().await.map_err(|_|failure("Link preview network request failed"))?;
    if response.status().is_redirection() {
      if redirects == 5 {
        return Err(failure("Link preview exceeded redirect limit"));
      }
      let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| failure("Preview redirect is missing a location"))?;
      url = normalize(
        url
          .join(location)
          .map_err(|_| failure("Invalid preview redirect"))?
          .as_str(),
      )?;
      continue;
    }
    if !response.status().is_success() {
      return Err(failure(&format!(
        "Link preview returned HTTP {}",
        response.status().as_u16()
      )));
    }
    let mime = response
      .headers()
      .get(reqwest::header::CONTENT_TYPE)
      .and_then(|v| v.to_str().ok())
      .unwrap_or("")
      .split(';')
      .next()
      .unwrap_or("")
      .trim()
      .to_ascii_lowercase();
    let limit = if raster(&mime) {
      IMAGE_LIMIT
    } else if ["text/html", "application/xhtml+xml"].contains(&mime.as_str()) {
      HTML_LIMIT
    } else {
      return Err(failure(
        "Link preview response has an unsupported content type",
      ));
    };
    if response
      .content_length()
      .is_some_and(|size| size > limit as u64)
    {
      return Err(failure("Link preview response exceeded maximum size"));
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
      let chunk = chunk.map_err(|_| failure("Link preview response failed"))?;
      if bytes.len() + chunk.len() > limit {
        return Err(failure("Link preview response exceeded maximum size"));
      }
      bytes.extend_from_slice(&chunk);
    }
    return Ok(Response { url, mime, bytes });
  }
  Err(failure("Link preview exceeded redirect limit"))
}
pub fn raster(mime: &str) -> bool {
  [
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]
  .contains(&mime)
}

pub fn validate_raster(bytes: &[u8]) -> BackendResult<()> {
  let size = imagesize::blob_size(bytes)
    .map_err(|_| failure("Preview image header is invalid or unsupported"))?;
  if size.width == 0
    || size.height == 0
    || size.width > 16384
    || size.height > 16384
    || size.width.saturating_mul(size.height) > 16 * 1024 * 1024
  {
    return Err(failure("Preview image exceeds supported pixel dimensions"));
  }
  Ok(())
}
#[cfg(test)]
mod tests {
  #[test]
  fn denies_private_special_and_mapped_addresses() {
    for ip in [
      "127.0.0.1",
      "10.0.0.1",
      "100.64.0.1",
      "169.254.169.254",
      "192.0.2.1",
      "198.18.1.1",
      "224.0.0.1",
      "::1",
      "::ffff:8.8.8.8",
      "fc00::1",
      "2001:db8::1",
      "2002:0808:0808::1",
    ] {
      assert!(!super::public(ip.parse().unwrap()), "{ip}");
    }
    for ip in ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"] {
      assert!(super::public(ip.parse().unwrap()), "{ip}");
    }
  }
  #[test]
  fn denies_unsafe_urls() {
    for url in [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://user:secret@example.org",
      "http://example.org\n/private",
    ] {
      assert!(super::normalize(url).is_err());
    }
  }
}
