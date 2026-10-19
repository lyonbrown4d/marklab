use crate::error::{BackendError, BackendResult};
use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq)]
pub enum Kind {
  Paragraph,
  Heading(u8),
  Quote,
  CodeBlock(String),
  List(Option<u64>),
  Item,
  Table(usize),
  TableHead,
  TableRow,
  TableCell,
  Emphasis,
  Strong,
  Strike,
  Link(String),
  Image(String),
  Footnote(String),
  Other,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Node {
  Element(Kind, Vec<Node>),
  Text(String),
  Code(String),
  Math(String, bool),
  FootnoteReference(String),
  Break(bool),
  Rule,
  Task(bool),
}

pub fn parse(markdown: &str) -> BackendResult<Vec<Node>> {
  let options = Options::ENABLE_TABLES
    | Options::ENABLE_FOOTNOTES
    | Options::ENABLE_STRIKETHROUGH
    | Options::ENABLE_TASKLISTS
    | Options::ENABLE_MATH;
  parse_level(&mut Parser::new_ext(markdown, options), 0)
}

fn parse_level<'a>(
  events: &mut impl Iterator<Item = Event<'a>>,
  depth: u16,
) -> BackendResult<Vec<Node>> {
  if depth > 128 {
    return Err(BackendError::new(
      "INVALID_DOCUMENT",
      "Markdown nesting exceeds 128 levels",
    ));
  }
  let mut nodes = Vec::new();
  while let Some(event) = events.next() {
    let node = match event {
      Event::Start(tag) => Node::Element(kind(tag), parse_level(events, depth + 1)?),
      Event::End(_) => break,
      Event::Text(text) => Node::Text(text.into_string()),
      Event::Code(text) => Node::Code(text.into_string()),
      Event::InlineMath(text) => Node::Math(text.into_string(), false),
      Event::DisplayMath(text) => Node::Math(text.into_string(), true),
      Event::FootnoteReference(label) => Node::FootnoteReference(label.into_string()),
      Event::SoftBreak => Node::Break(false),
      Event::HardBreak => Node::Break(true),
      Event::Rule => Node::Rule,
      Event::TaskListMarker(done) => Node::Task(done),
      Event::Html(html) | Event::InlineHtml(html) => {
        if ["<br>", "<br/>", "<br />"].contains(&html.trim().to_lowercase().as_str()) {
          Node::Break(true)
        } else {
          continue;
        }
      }
    };
    nodes.push(node);
  }
  Ok(nodes)
}

fn kind(tag: Tag<'_>) -> Kind {
  match tag {
    Tag::Paragraph => Kind::Paragraph,
    Tag::Heading { level, .. } => Kind::Heading(level as u8),
    Tag::BlockQuote(_) => Kind::Quote,
    Tag::CodeBlock(kind) => Kind::CodeBlock(match kind {
      CodeBlockKind::Fenced(language) => language.into_string(),
      CodeBlockKind::Indented => String::new(),
    }),
    Tag::List(start) => Kind::List(start),
    Tag::Item => Kind::Item,
    Tag::Table(columns) => Kind::Table(columns.len()),
    Tag::TableHead => Kind::TableHead,
    Tag::TableRow => Kind::TableRow,
    Tag::TableCell => Kind::TableCell,
    Tag::Emphasis => Kind::Emphasis,
    Tag::Strong => Kind::Strong,
    Tag::Strikethrough => Kind::Strike,
    Tag::Link { dest_url, .. } => Kind::Link(dest_url.into_string()),
    Tag::Image { dest_url, .. } => Kind::Image(dest_url.into_string()),
    Tag::FootnoteDefinition(label) => Kind::Footnote(label.into_string()),
    _ => Kind::Other,
  }
}

pub fn plain(nodes: &[Node]) -> String {
  nodes
    .iter()
    .map(|node| match node {
      Node::Element(_, children) => plain(children),
      Node::Text(value) | Node::Code(value) | Node::Math(value, _) => value.clone(),
      Node::Break(_) => "\n".into(),
      Node::FootnoteReference(value) => format!("[{value}]"),
      Node::Task(done) => {
        if *done {
          "☑ ".into()
        } else {
          "☐ ".into()
        }
      }
      Node::Rule => String::new(),
    })
    .collect()
}

pub fn footnotes(nodes: &[Node]) -> BTreeMap<String, Vec<Node>> {
  let mut notes = BTreeMap::new();
  for node in nodes {
    if let Node::Element(kind, children) = node {
      if let Kind::Footnote(label) = kind {
        notes.insert(label.clone(), children.clone());
      } else {
        notes.extend(footnotes(children));
      }
    }
  }
  notes
}

pub fn safe_link(url: &str) -> bool {
  let lower = url.trim().to_ascii_lowercase();
  lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")
}
