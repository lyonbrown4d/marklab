use super::*;
use quick_xml::{Reader, events::Event};
#[derive(Default)]
struct Response {
  href: String,
  size: u64,
  modified: String,
  etag: Option<String>,
  directory: bool,
  success: bool,
}
pub(super) fn parse(remote: &DavRemote, body: &[u8]) -> BackendResult<Vec<RemoteEntry>> {
  let mut reader = Reader::from_reader(body);
  reader.config_mut().trim_text(false);
  let mut response = None::<Response>;
  let mut field = String::new();
  let mut content = String::new();
  let mut entries = Vec::new();
  loop {
    match reader
      .read_event()
      .map_err(|_| paths::invalid("Invalid WebDAV XML response"))?
    {
      Event::DocType(_) => return Err(paths::invalid("WebDAV XML cannot declare entities")),
      Event::Start(tag) => {
        let name = tag.local_name().as_ref().to_owned();
        if name == "response" {
          response = Some(Response::default());
        }
        if let Some(response) = &mut response
          && name == "collection"
        {
          response.directory = true;
        }
        field = name;
        content.clear();
      }
      Event::Empty(tag) => {
        if tag.local_name().as_ref() == "collection"
          && let Some(response) = &mut response
        {
          response.directory = true;
        }
      }
      Event::Text(text) => {
        if response.is_some() {
          content.push_str(text.as_ref());
        }
      }
      Event::CData(text) => {
        if response.is_some() {
          content.push_str(text.as_ref());
        }
      }
      Event::GeneralRef(reference) => {
        let entity = format!("&{};", reference.as_ref());
        let decoded = quick_xml::escape::unescape(&entity)
          .map_err(|_| paths::invalid("Unknown WebDAV XML entity"))?;
        content.push_str(&decoded);
      }
      Event::End(tag) => {
        if tag.local_name().as_ref() == field
          && let Some(response) = &mut response
        {
          let text = content.trim();
          match field.as_str() {
            "href" => response.href = text.into(),
            "getcontentlength" => {
              response.size = text
                .parse()
                .map_err(|_| paths::invalid("Invalid WebDAV content size"))?
            }
            "getlastmodified" => response.modified = text.into(),
            "getetag" => response.etag = Some(text.into()),
            "status" if text.split_whitespace().nth(1) == Some("200") => {
              response.success = true;
            }
            _ => {}
          }
        }
        if tag.local_name().as_ref() == "response"
          && let Some(response) = response.take()
          && response.success
        {
          entries.push(to_entry(remote, response)?);
        }
        field.clear();
        content.clear();
      }
      Event::Eof => break,
      _ => {}
    }
  }
  Ok(entries)
}
fn to_entry(remote: &DavRemote, response: Response) -> BackendResult<RemoteEntry> {
  let url = remote
    .inner
    .endpoint
    .join(&response.href)
    .map_err(|_| paths::invalid("Invalid DAV href"))?;
  if url.origin() != remote.inner.endpoint.origin()
    || url.query().is_some()
    || url.fragment().is_some()
  {
    return Err(BackendError::new(
      "WEBDAV_ORIGIN_MISMATCH",
      "WebDAV response escaped the configured origin",
    ));
  }
  let full = paths::decode(url.path())?;
  let root = paths::decode(remote.url("")?.path())?;
  let full = full.trim_end_matches('/');
  let root = root.trim_end_matches('/');
  let path = if full == root {
    String::new()
  } else {
    full
      .strip_prefix(&format!("{root}/"))
      .ok_or_else(|| paths::invalid("WebDAV response escaped configured directory"))?
      .to_string()
  };
  paths::remote_path(&path)?;
  let modified = chrono::DateTime::parse_from_rfc2822(&response.modified)
    .map(|date| date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".into());
  Ok(RemoteEntry {
    path,
    directory: response.directory,
    size: response.size,
    modified_at: modified,
    etag: response.etag,
  })
}
#[cfg(test)]
mod tests {
  use super::*;
  fn remote() -> DavRemote {
    DavRemote::new(
      &Profile {
        id: "dav".into(),
        label: "DAV".into(),
        endpoint: "https://example.com".into(),
        base_path: "/dav".into(),
        username: "user".into(),
        allow_insecure_local: false,
        session_only: true,
        has_password: false,
        created_at: String::new(),
        updated_at: String::new(),
      },
      None,
      "/notes",
    )
    .unwrap()
  }
  #[test]
  fn parses_namespaced_metadata_and_xml_entities_without_following_origins() {
    let xml=br#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/notes/a&amp;b.md</d:href><d:propstat><d:prop><d:getcontentlength>5</d:getcontentlength><d:getetag>&quot;v1&quot;</d:getetag><d:getlastmodified>Tue, 01 Oct 2024 00:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#;
    let values = parse(&remote(), xml).unwrap();
    assert_eq!(values.len(), 1);
    assert_eq!(values[0].path, "a&b.md");
    assert_eq!(values[0].etag.as_deref(), Some("\"v1\""));
    assert_eq!(values[0].size, 5);
    let unicode = String::from_utf8(xml.to_vec())
      .unwrap()
      .replace("a&amp;b.md", "笔记&#x4E2D;.md")
      .replace("&quot;v1&quot;", "<![CDATA[\"版&本\"]]>");
    let values = parse(&remote(), unicode.as_bytes()).unwrap();
    assert_eq!(values[0].path, "笔记中.md");
    assert_eq!(values[0].etag.as_deref(), Some("\"版&本\""));
    let external = String::from_utf8(xml.to_vec())
      .unwrap()
      .replace("/dav/notes/a&amp;b.md", "https://evil.example/secret");
    assert!(parse(&remote(), external.as_bytes()).is_err());
    assert!(
      parse(
        &remote(),
        br#"<!DOCTYPE foo [<!ENTITY x "boom">]><d:multistatus xmlns:d="DAV:"/>"#
      )
      .is_err()
    );
  }
}
