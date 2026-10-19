use super::{PreviewResult, network};
use crate::error::BackendResult;
use scraper::{Html, Selector};
use url::Url;
fn normalized(value: &str) -> Option<String> {
  let text = value.split_whitespace().collect::<Vec<_>>().join(" ");
  (!text.is_empty()).then_some(text)
}
fn resolve(value: Option<String>, base: &Url) -> Option<String> {
  let url = base.join(value.as_deref()?).ok()?;
  network::normalize(url.as_str()).ok().map(Into::into)
}
pub fn parse(html: &str, base: &Url) -> BackendResult<PreviewResult> {
  let document = Html::parse_document(html);
  let meta =
    Selector::parse("meta").map_err(|_| network::failure("Cannot parse metadata selector"))?;
  let links =
    Selector::parse("link").map_err(|_| network::failure("Cannot parse link selector"))?;
  let title =
    Selector::parse("title").map_err(|_| network::failure("Cannot parse title selector"))?;
  let content = |names: &[&str]| {
    document.select(&meta).find_map(|tag| {
      let key = tag
        .value()
        .attr("property")
        .or_else(|| tag.value().attr("name"))?
        .trim()
        .to_ascii_lowercase();
      if names.contains(&key.as_str()) {
        normalized(tag.value().attr("content")?)
      } else {
        None
      }
    })
  };
  let link = |name: &str| {
    document.select(&links).find_map(|tag| {
      if tag
        .value()
        .attr("rel")
        .is_some_and(|rel| rel.split_whitespace().any(|v| v.eq_ignore_ascii_case(name)))
      {
        resolve(tag.value().attr("href").map(str::to_owned), base)
      } else {
        None
      }
    })
  };
  let title = content(&["og:title"])
    .or_else(|| content(&["twitter:title"]))
    .or_else(|| {
      document
        .select(&title)
        .next()
        .and_then(|tag| normalized(&tag.text().collect::<String>()))
    });
  Ok(PreviewResult::Webpage {
    url: base.to_string(),
    canonical: link("canonical"),
    title,
    description: content(&["og:description"])
      .or_else(|| content(&["twitter:description"]))
      .or_else(|| content(&["description"])),
    image: resolve(
      content(&[
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
      ]),
      base,
    ),
    favicon: link("icon")
      .or_else(|| link("apple-touch-icon"))
      .or_else(|| link("mask-icon")),
    site_name: content(&["og:site_name"]),
  })
}
#[cfg(test)]
mod tests {
  #[test]
  fn extracts_metadata_and_resolves_only_safe_urls() {
    let url = url::Url::parse("https://example.org/docs/page").unwrap();
    let result=super::parse("<title>Fallback &amp; title</title><meta property='og:title' content='Preferred'><meta name='description' content='A useful description'><meta property='og:image' content='../image.png'><link rel='icon' href='javascript:bad'>",&url).unwrap();
    match result {
      super::PreviewResult::Webpage {
        title,
        image,
        favicon,
        ..
      } => {
        assert_eq!(title.as_deref(), Some("Preferred"));
        assert_eq!(image.as_deref(), Some("https://example.org/image.png"));
        assert!(favicon.is_none());
      }
      _ => panic!("expected webpage"),
    }
  }
}
