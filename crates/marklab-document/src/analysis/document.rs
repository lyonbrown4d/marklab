use crate::error::{BackendError, BackendResult};
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd};
use regex::Regex;
use std::{collections::BTreeMap, ops::Range, sync::LazyLock};
#[path = "document_types.rs"]
mod types;
pub use types::{Document, Heading, Link, LinkKind};
#[path = "link_positions.rs"]
mod link_positions;
pub use link_positions::position;
#[path = "document_positions.rs"]
mod positions;
use positions::DocumentPositions;

static WIKI: LazyLock<Result<Regex, regex::Error>> =
  LazyLock::new(|| Regex::new(r"!?\[\[([^\]\n]+?)\]\]"));

struct PendingLink {
  target: String,
  text: String,
  range: Range<usize>,
  image: bool,
  inline: bool,
}

pub fn parse(path: String, content: String) -> BackendResult<Document> {
  let positions = DocumentPositions::new(&content);
  let mut headings = Vec::new();
  let mut links = Vec::new();
  let mut assets = Vec::new();
  let mut heading: Option<(u8, usize, String)> = None;
  let mut pending_links: Vec<PendingLink> = Vec::new();
  let mut prose_spans: Vec<Range<usize>> = Vec::new();
  let mut code_depth: usize = 0;
  let mut used_slugs = BTreeMap::<String, usize>::new();
  let wiki = WIKI
    .as_ref()
    .map_err(|error| BackendError::new("INDEX_ERROR", error.to_string()))?;
  for (event, range) in Parser::new_ext(
    &content,
    Options::ENABLE_TABLES
      | Options::ENABLE_FOOTNOTES
      | Options::ENABLE_STRIKETHROUGH
      | Options::ENABLE_MATH,
  )
  .into_offset_iter()
  {
    let prose = matches!(&event, Event::Text(_));
    match event {
      Event::Start(Tag::Heading { level, .. }) => {
        heading = Some((level as u8, range.start, String::new()))
      }
      Event::End(TagEnd::Heading(_)) => {
        if let Some((level, offset, text)) = heading.take() {
          let base = slug(&text);
          let count = used_slugs.entry(base.clone()).or_default();
          let slug = if *count == 0 {
            base
          } else {
            format!("{base}-{count}")
          };
          *count += 1;
          let (line, column) = positions.position(offset);
          headings.push(Heading {
            path: path.clone(),
            slug,
            text,
            level,
            line,
            column,
          });
        }
      }
      Event::Start(Tag::CodeBlock(_)) => code_depth += 1,
      Event::End(TagEnd::CodeBlock) => code_depth = code_depth.saturating_sub(1),
      Event::Start(Tag::Link {
        dest_url,
        link_type,
        ..
      }) => pending_links.push(PendingLink {
        target: dest_url.into_string(),
        text: String::new(),
        range,
        image: false,
        inline: link_type == LinkType::Inline,
      }),
      Event::Start(Tag::Image {
        dest_url,
        link_type,
        ..
      }) => pending_links.push(PendingLink {
        target: dest_url.into_string(),
        text: String::new(),
        range,
        image: true,
        inline: link_type == LinkType::Inline,
      }),
      Event::End(TagEnd::Link | TagEnd::Image) => {
        if let Some(pending) = pending_links.pop() {
          let item = link_at(
            &path,
            &positions,
            pending.target,
            pending.text,
            LinkKind::Markdown,
            pending.range,
            pending.inline,
          );
          if pending.image {
            assets.push(item);
          } else {
            links.push(item);
          }
        }
      }
      Event::Text(value) | Event::Code(value) => {
        if let Some((_, _, text)) = heading.as_mut() {
          text.push_str(&value);
        }
        if !pending_links.is_empty() {
          for pending in &mut pending_links {
            pending.text.push_str(&value);
          }
          continue;
        }
        if code_depth > 0 || !prose {
          continue;
        }
        // Parsers may split unmatched wiki brackets into consecutive
        // Text events. Merge their contiguous source spans before scanning.
        if let Some(previous) = prose_spans
          .last_mut()
          .filter(|previous| previous.end == range.start)
        {
          previous.end = range.end;
        } else {
          prose_spans.push(range);
        }
      }
      Event::SoftBreak | Event::HardBreak => {
        if let Some((_, _, text)) = heading.as_mut() {
          text.push(' ');
        }
      }
      _ => {}
    }
  }
  for range in prose_spans {
    let raw = &content[range.clone()];
    for capture in wiki.captures_iter(raw) {
      let Some(found) = capture.get(0) else {
        continue;
      };
      let inner = capture.get(1).map(|value| value.as_str()).unwrap_or("");
      let (target, label) = inner.split_once('|').unwrap_or((inner, inner));
      let item = link_at(
        &path,
        &positions,
        target.trim().into(),
        label.trim().into(),
        LinkKind::Wiki,
        range.start + found.start()..range.start + found.end(),
        true,
      );
      if found.as_str().starts_with('!') {
        assets.push(item);
      } else {
        links.push(item);
      }
    }
  }
  links.sort_by_key(|link| link.span_start);
  assets.sort_by_key(|link| link.span_start);
  let title = headings
    .first()
    .map(|heading| heading.text.clone())
    .unwrap_or_else(|| {
      std::path::Path::new(&path)
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone())
    });
  let word_count = content.split_whitespace().count()
    + content
      .chars()
      .filter(|c| matches!(*c as u32, 0x3400..=0x9fff))
      .count();
  Ok(Document {
    path,
    title,
    content: content.into(),
    headings,
    links,
    assets,
    word_count,
  })
}

fn link_at(
  path: &str,
  positions: &DocumentPositions<'_>,
  target: String,
  text: String,
  kind: LinkKind,
  range: Range<usize>,
  inline: bool,
) -> Link {
  let content = positions.text;
  let raw = &content[range.clone()];
  // Resolved reference-style destinations are outside this usage span.
  // Never mistake matching label text for a writable destination.
  let found = link_positions::destination(raw, &target, kind.as_str(), inline);
  let destination = found.map_or(range.start, |index| range.start + index);
  let (line, column) = positions.position(destination);
  let context = positions.context(line).to_owned();
  let end_offset = destination + found.map_or(0, |_| target.len());
  Link {
    source_path: path.into(),
    target,
    text,
    context,
    line,
    column,
    link_type: kind,
    target_path: None,
    target_anchor: None,
    target_heading_slug: None,
    is_external: false,
    offset: destination,
    end_offset,
    span_start: range.start,
    span_end: range.end,
  }
}

pub fn slug(text: &str) -> String {
  let value: String = text
    .to_lowercase()
    .chars()
    .filter_map(|c| {
      if c.is_whitespace() {
        Some('-')
      } else if c.is_alphanumeric() || matches!(c, '_' | '-') {
        Some(c)
      } else {
        None
      }
    })
    .collect();
  if value.is_empty() {
    "heading".into()
  } else {
    value
  }
}
