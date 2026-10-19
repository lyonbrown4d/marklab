//! Static user documents are sanitized before entering an opaque sandboxed iframe.
//! Inline CSS is retained for layout; the frame CSP denies all network access.
use crate::{
  error::{BackendError, BackendResult},
  native_window::TrustedWindow,
};
use ammonia::{Builder, UrlRelative};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const MAX_SOURCE_BYTES: usize = 512 * 1024;
const MAX_DOCUMENT_BYTES: usize = 4 * 1024 * 1024;
const POLICY: &str = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HtmlPreviewRequest {
  source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlPreviewResult {
  document: String,
}

fn render(source: &str) -> BackendResult<HtmlPreviewResult> {
  if source.len() > MAX_SOURCE_BYTES {
    return Err(BackendError::new(
      "HTML_TOO_LARGE",
      "HTML preview is limited to 512 KiB",
    ));
  }
  let (html_attributes, body_attributes) = document_attributes(source)?;
  let clean = Builder::default()
    .rm_clean_content_tags(&["style"])
    .add_tags(&["style"])
    .add_generic_attributes(&["class", "id", "style"])
    .url_schemes(HashSet::from(["data"]))
    .url_relative(UrlRelative::Deny)
    .attribute_filter(|tag, attribute, value| match attribute {
      // Links remain readable, but cannot navigate the frame away from its CSP.
      "href" | "action" | "formaction" | "srcset" | "background" | "poster" => None,
      "src" => {
        let safe_image = tag == "img"
          && [
            "data:image/png;base64,",
            "data:image/jpeg;base64,",
            "data:image/gif;base64,",
            "data:image/webp;base64,",
          ]
          .iter()
          .any(|prefix| value.starts_with(prefix));
        safe_image.then(|| value.into())
      }
      _ => Some(value.into()),
    })
    .clean(source)
    .to_string();
  // This shell is document content, never an application entry point. The
  // sanitizer removes user meta/base tags before the fixed policy is inserted.
  let document = format!(
    "<!doctype html><html{html_attributes}><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"{POLICY}\"><meta name=\"referrer\" content=\"no-referrer\"></head><body{body_attributes}>{clean}</body></html>"
  );
  if document.len() > MAX_DOCUMENT_BYTES {
    return Err(BackendError::new(
      "HTML_TOO_LARGE",
      "Prepared HTML exceeds the preview limit",
    ));
  }
  Ok(HtmlPreviewResult { document })
}

fn document_attributes(source: &str) -> BackendResult<(String, String)> {
  let document = scraper::Html::parse_document(source);
  let body = scraper::Selector::parse("body")
    .map_err(|_| BackendError::new("HTML_PREVIEW_FAILED", "Cannot prepare HTML document"))?;
  let attributes = |element: scraper::ElementRef<'_>| {
    let mut output = String::new();
    // Fragment sanitizers omit the outer document. Reapply only presentation
    // attributes; never transport event handlers, URLs or browsing contexts.
    for name in ["class", "id", "style", "lang", "dir"] {
      if let Some(value) = element.value().attr(name) {
        let escaped = value
          .replace('&', "&amp;")
          .replace('<', "&lt;")
          .replace('>', "&gt;")
          .replace('"', "&quot;")
          .replace('\'', "&#39;");
        output.push_str(&format!(" {name}=\"{escaped}\""));
      }
    }
    output
  };
  Ok((
    attributes(document.root_element()),
    document
      .select(&body)
      .next()
      .map(attributes)
      .unwrap_or_default(),
  ))
}

#[tauri::command]
pub async fn html_preview_render(
  _window: TrustedWindow,
  request: HtmlPreviewRequest,
) -> BackendResult<HtmlPreviewResult> {
  // Validate before queuing so oversized requests do not occupy worker slots.
  if request.source.len() > MAX_SOURCE_BYTES {
    return Err(BackendError::new(
      "HTML_TOO_LARGE",
      "HTML preview is limited to 512 KiB",
    ));
  }
  crate::blocking::run(move || render(&request.source)).await
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn preserves_document_text_tables_and_inline_styles() {
    let result = render("<html lang='zh-CN'><head><style>.dark .x { color: red }</style></head><body class='dark' style='background:#000' onload='bad()'><table class='x'><tr><td style='padding:4px'>中文</td></tr></table></body></html>").unwrap();
    assert!(result.document.contains(".x { color: red }"));
    assert!(result.document.contains("class=\"x\""));
    assert!(result.document.contains("style=\"padding:4px\""));
    assert!(
      result
        .document
        .contains("<body class=\"dark\" style=\"background:#000\">")
    );
    assert!(result.document.contains("<html lang=\"zh-CN\">"));
    assert!(!result.document.contains("onload"));
    assert!(result.document.contains("中文"));
    assert!(result.document.contains("default-src 'none'"));
  }

  #[test]
  fn removes_scripts_frames_navigation_and_remote_resources() {
    let result = render(r#"<meta http-equiv="refresh" content="0;url=https://bad"><base href="https://bad"><script>window.__bad=1</script><iframe srcdoc="x"></iframe><object data="x"></object><img src="https://bad/a.png" onerror="bad()"><a href="file:///private/test">Link</a><form action="https://bad"><input name="x"></form>"#).unwrap();
    for forbidden in [
      "<script",
      "<iframe",
      "<object",
      "onerror",
      "https://bad",
      "file:///",
      "<form",
      "<input",
      "http-equiv=\"refresh\"",
    ] {
      assert!(!result.document.contains(forbidden), "{forbidden}");
    }
    assert!(result.document.contains("Link"));
  }

  #[test]
  fn accepts_only_embedded_raster_images_and_bounds_source() {
    let result = render(r#"<img src="data:image/png;base64,iVBORw0KGgo="><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="/etc/passwd">"#).unwrap();
    assert!(result.document.contains("data:image/png;base64,"));
    assert!(!result.document.contains("data:image/svg"));
    assert!(!result.document.contains("/etc/passwd"));
    assert!(render(&"x".repeat(MAX_SOURCE_BYTES + 1)).is_err());
  }

  #[test]
  fn accepts_escape_expansion_and_encodes_outer_attributes() {
    let result = render(&"&".repeat(220_000)).unwrap();
    assert!(result.document.len() > 1024 * 1024);
    assert!(result.document.len() <= MAX_DOCUMENT_BYTES);
    let result = render("<body class='x&quot; onload=&quot;bad'>Text</body>").unwrap();
    assert!(
      result
        .document
        .contains("class=\"x&quot; onload=&quot;bad\"")
    );
    let parsed = scraper::Html::parse_document(&result.document);
    let selector = scraper::Selector::parse("body").unwrap();
    assert!(
      parsed
        .select(&selector)
        .next()
        .unwrap()
        .value()
        .attr("onload")
        .is_none()
    );
  }
}
