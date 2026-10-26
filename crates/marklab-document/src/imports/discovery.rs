use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use std::ops::Range;

pub struct Import {
  pub range: Range<usize>,
  pub url: String,
  pub title: String,
  pub appendix: bool,
}

pub fn extension(url: &str) -> String {
  let raw = url.split(['?', '#']).next().unwrap_or("");
  std::path::Path::new(raw)
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or("")
    .to_ascii_lowercase()
}

pub fn supported(url: &str) -> bool {
  matches!(
    extension(url).as_str(),
    "xlsx" | "xlsm" | "csv" | "tsv" | "xls" | "ods"
  )
}

pub fn find(markdown: &str, linked: bool) -> Vec<Import> {
  let mut imports = Vec::new();
  let mut attachments = Vec::new();
  let mut image = None;
  let mut link = None;
  let mut table = None;
  let mut tables = Vec::new();
  let mut protected = Vec::new();
  let mut link_spans = Vec::new();
  let mut code = None;
  for (event, range) in Parser::new_ext(markdown, Options::ENABLE_TABLES).into_offset_iter() {
    match event {
      Event::Start(Tag::Table(_)) => table = Some(range.start),
      Event::End(TagEnd::Table) => {
        if let Some(start) = table.take() {
          tables.push(start..range.end);
        }
      }
      Event::Start(Tag::CodeBlock(_)) => code = Some(range.start),
      Event::End(TagEnd::CodeBlock) => {
        if let Some(start) = code.take() {
          protected.push(start..range.end);
        }
      }
      Event::Code(_) | Event::Html(_) | Event::InlineHtml(_) => protected.push(range),
      Event::Start(Tag::Image {
        dest_url, title, ..
      }) => {
        image = Some((
          range.start,
          dest_url.into_string(),
          title.into_string(),
          table.is_some() || link.is_some(),
        ));
      }
      Event::End(TagEnd::Image) => {
        if let Some((start, url, title, appendix)) = image.take() {
          protected.push(start..range.end);
          if supported(&url) {
            imports.push(Import {
              range: start..range.end,
              url,
              title,
              appendix,
            });
          }
        }
      }
      Event::Start(Tag::Link {
        dest_url, title, ..
      }) => {
        link = Some((range.start, dest_url.into_string(), title.into_string()));
      }
      Event::End(TagEnd::Link) => {
        if let Some((start, url, title)) = link.take() {
          link_spans.push(start..range.end);
          // Optional attachments retain the original link and render after the document.
          if linked && supported(&url) && !url.contains(':') && !url.starts_with('/') {
            attachments.push(Import {
              range: start..range.end,
              url,
              title,
              appendix: true,
            });
          }
        }
      }
      _ => {}
    }
  }
  // Wiki embeds are an existing editor syntax. Exclude code and parsed image spans.
  let mut offset = 0;
  while let Some(start) = markdown[offset..].find("![[").map(|start| start + offset) {
    let Some(end) = markdown[start + 3..]
      .find("]]")
      .map(|end| start + 3 + end + 2)
    else {
      break;
    };
    offset = end;
    let raw = &markdown[start + 3..end - 2];
    if raw.contains('\n') || protected.iter().any(|range| range.contains(&start)) {
      continue;
    }
    let (url, title) = raw.split_once('|').unwrap_or((raw, ""));
    if supported(url) {
      imports.push(Import {
        range: start..end,
        url: url.into(),
        title: title.into(),
        appendix: tables
          .iter()
          .chain(&link_spans)
          .any(|range| range.contains(&start)),
      });
    }
  }
  // An image may itself be the label of a link. Prefer the explicit embed so
  // replacement ranges never overlap and resource bytes remain image-only.
  let attachments = attachments
    .into_iter()
    .filter(|link| {
      !imports
        .iter()
        .any(|embed| link.range.start < embed.range.end && embed.range.start < link.range.end)
    })
    .collect::<Vec<_>>();
  imports.extend(attachments);
  imports.sort_by_key(|import| import.range.start);
  imports
}
