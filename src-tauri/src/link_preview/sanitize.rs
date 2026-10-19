use super::{network, network::Response};
use crate::error::BackendResult;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{
  borrow::Cow,
  collections::{HashMap, HashSet},
};
use url::Url;
fn image_urls(html: &str, base: &Url) -> Vec<String> {
  let document = scraper::Html::parse_document(html);
  let Ok(selector) = scraper::Selector::parse("img[src]") else {
    return vec![];
  };
  document
    .select(&selector)
    .filter_map(|tag| tag.value().attr("src"))
    .filter_map(|src| base.join(src).ok())
    .filter_map(|url| network::normalize(url.as_str()).ok().map(String::from))
    .take(4)
    .collect()
}
pub async fn document(response: Response) -> BackendResult<String> {
  if network::raster(&response.mime) {
    return crate::blocking::run(move || {
      network::validate_raster(&response.bytes)?;
      let image = format!(
        "data:{};base64,{}",
        response.mime,
        STANDARD.encode(response.bytes)
      );
      Ok(envelope(&format!(
        "<main><img src=\"{image}\" alt=\"\"></main>"
      )))
    })
    .await;
  }
  let base = response.url;
  let (html, urls) = crate::blocking::run(move || {
    let html = String::from_utf8_lossy(&response.bytes).to_string();
    let urls = image_urls(&html, &base);
    Ok(((html, base), urls))
  })
  .await?;
  let (html, base) = html;
  let mut images = HashMap::new();
  let mut total = 0;
  for url in urls {
    if let Ok(image) = network::fetch(network::normalize(&url)?).await
      && network::raster(&image.mime)
      && total + image.bytes.len() <= network::IMAGE_LIMIT
    {
      let size = image.bytes.len();
      if let Ok(encoded) = crate::blocking::run(move || {
        network::validate_raster(&image.bytes)?;
        Ok(format!(
          "data:{};base64,{}",
          image.mime,
          STANDARD.encode(image.bytes)
        ))
      })
      .await
      {
        total += size;
        images.insert(url, encoded);
      }
    }
  }
  crate::blocking::run(move || Ok(envelope(&clean(&html, &base, &images)))).await
}
fn clean(html: &str, base: &Url, images: &HashMap<String, String>) -> String {
  let tags: HashSet<_> = [
    "a",
    "abbr",
    "article",
    "aside",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "details",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "i",
    "img",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "s",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ]
  .into_iter()
  .collect();
  let base = base.clone();
  let images = images.clone();
  ammonia::Builder::default()
    .tags(tags)
    .generic_attributes(HashSet::new())
    .tag_attributes(HashMap::from([
      ("img", HashSet::from(["src", "alt"])),
      ("td", HashSet::from(["colspan", "rowspan"])),
      ("th", HashSet::from(["colspan", "rowspan"])),
    ]))
    .url_schemes(HashSet::from(["data", "http", "https"]))
    .attribute_filter(move |tag, attribute, value| {
      if tag == "img" && attribute == "src" {
        let url = base.join(value).ok()?;
        images
          .get(url.as_str())
          .map(|value| Cow::Owned(value.clone()))
      } else {
        Some(Cow::Borrowed(value))
      }
    })
    .strip_comments(true)
    .clean(html)
    .to_string()
}
fn envelope(body: &str) -> String {
  format!(
    "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; img-src data:; style-src 'unsafe-inline'\"><meta charset=\"utf-8\"><style>html{{background:#fff;color:#202124;font:18px system-ui,sans-serif}}body{{margin:36px;max-width:1800px;overflow:hidden}}img{{max-width:100%;max-height:650px;object-fit:contain}}table{{border-collapse:collapse}}td,th{{border:1px solid #ccc;padding:8px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}a{{color:#2563eb}}h1{{font-size:2.3em}}p{{line-height:1.6}}</style></head><body>{body}</body></html>"
  )
}
#[cfg(test)]
mod tests {
  #[test]
  fn removes_active_content_and_every_external_resource() {
    let base = url::Url::parse("https://example.org/").unwrap();
    let output = super::clean(
      "<script>fetch('http://127.0.0.1')</script><iframe src='https://evil.org'></iframe><img src='http://127.0.0.1/private'><div style='background:url(http://127.0.0.1)'>Safe text</div><form action='https://evil.org'><input></form>",
      &base,
      &std::collections::HashMap::new(),
    );
    assert!(!output.contains("script"));
    assert!(!output.contains("iframe"));
    assert!(!output.contains("127.0.0.1"));
    assert!(!output.contains("style="));
    assert!(!output.contains("form"));
    assert!(output.contains("Safe text"));
  }
}

#[cfg(test)]
mod inline_tests {
  #[test]
  fn only_prevalidated_inline_images_survive_the_document_sanitizer() {
    let base = url::Url::parse("https://example.com/docs/").unwrap();
    let images = std::collections::HashMap::from([(
      "https://example.com/docs/image.png".into(),
      "data:image/png;base64,AA==".into(),
    )]);
    let output = super::clean(
      "<img src='image.png' onerror='bad()'><img src='https://other.example/img.png'><video src='http://private.local/'></video><svg><image href='https://bad/'></image></svg>",
      &base,
      &images,
    );
    assert!(output.contains("data:image/png;base64,AA=="));
    assert!(!output.contains("https://"));
    assert!(!output.contains("onerror"));
    assert!(!output.contains("<video"));
    assert!(!output.contains("<svg"));
    let document = super::envelope(&output);
    assert!(document.contains("script-src 'none'"));
    assert!(document.contains("connect-src 'none'"));
  }
}
