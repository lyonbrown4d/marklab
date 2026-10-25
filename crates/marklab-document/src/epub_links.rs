use crate::{
  analysis::slug,
  markdown::{self, Kind, Node},
  types::SourceDocument,
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) struct ChapterLinks {
  pub path: String,
  pub headings: Vec<String>,
  fragments: BTreeMap<String, String>,
}

pub(super) fn chapters(documents: &[SourceDocument], nodes: &[Vec<Node>]) -> Vec<ChapterLinks> {
  documents
    .iter()
    .zip(nodes)
    .map(|(document, nodes)| {
      let mut chapter = ChapterLinks {
        path: normalize(&document.path),
        headings: Vec::new(),
        fragments: BTreeMap::new(),
      };
      let mut counts = BTreeMap::<String, usize>::new();
      collect(nodes, &mut chapter, &mut counts, &mut BTreeSet::new());
      chapter
    })
    .collect()
}

fn collect(
  nodes: &[Node],
  chapter: &mut ChapterLinks,
  counts: &mut BTreeMap<String, usize>,
  used: &mut BTreeSet<String>,
) {
  for node in nodes {
    if let Node::Element(kind, children) = node {
      if matches!(kind, Kind::Heading(_)) {
        let text = markdown::plain(children);
        let base = slug(&text);
        let count = counts.entry(base.clone()).or_default();
        let mut fragment = base.clone();
        while used.contains(&fragment) {
          *count += 1;
          fragment = format!("{base}-{count}");
        }
        used.insert(fragment.clone());
        let id = format!("heading-{fragment}");
        chapter.fragments.entry(text).or_insert_with(|| id.clone());
        chapter
          .fragments
          .entry(fragment)
          .or_insert_with(|| id.clone());
        chapter.headings.push(id);
      }
      collect(children, chapter, counts, used);
    }
  }
}

pub(super) fn href(url: &str, current: usize, chapters: &[ChapterLinks]) -> Option<String> {
  let url = url.trim();
  if markdown::safe_link(url) {
    return Some(url.into());
  }
  if url.starts_with("//") || url.contains(':') || url.contains('?') {
    return None;
  }
  let (path, fragment) = url
    .split_once('#')
    .map_or((url, None), |(path, hash)| (path, Some(hash)));
  let path = decode(path)?;
  let target = if path.is_empty() {
    current
  } else {
    let current_path = chapters.get(current)?.path.as_str();
    let directory = current_path
      .rsplit_once('/')
      .map_or("", |(parent, _)| parent);
    let resolved = if path.starts_with('/') || directory.is_empty() {
      normalize(&path)
    } else {
      normalize(&format!("{directory}/{path}"))
    };
    chapters
      .iter()
      .position(|chapter| chapter.path == resolved)?
  };
  let anchor = match fragment {
    Some("") | None => format!("chapter-{target}"),
    Some(fragment) => {
      let decoded = decode(fragment)?;
      let map = &chapters[target].fragments;
      map
        .get(&decoded)
        .or_else(|| map.get(&slug(&decoded)))?
        .clone()
    }
  };
  Some(format!("chapter-{target}.xhtml#{anchor}"))
}

fn normalize(value: &str) -> String {
  let value = value.replace('\\', "/");
  let mut parts = Vec::new();
  for part in value.split('/') {
    match part {
      "" | "." => (),
      ".." if parts.last().is_some_and(|last| *last != "..") => {
        parts.pop();
      }
      ".." => parts.push(".."),
      _ => parts.push(part),
    }
  }
  let prefix = if value.starts_with('/') { "/" } else { "" };
  format!("{prefix}{}", parts.join("/"))
}

fn decode(value: &str) -> Option<String> {
  let bytes = value.as_bytes();
  let mut decoded = Vec::with_capacity(bytes.len());
  let mut index = 0;
  while index < bytes.len() {
    if bytes[index] == b'%' {
      let high = (*bytes.get(index + 1)? as char).to_digit(16)?;
      let low = (*bytes.get(index + 2)? as char).to_digit(16)?;
      decoded.push((high * 16 + low) as u8);
      index += 3;
    } else {
      decoded.push(bytes[index]);
      index += 1;
    }
  }
  String::from_utf8(decoded).ok()
}
