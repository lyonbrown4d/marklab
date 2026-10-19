use super::{Position, item};
use crate::analysis::Index;
use serde_json::{Value, json};
use std::{cmp::Ordering, collections::BTreeSet};

pub(super) const LIMIT: usize = 100;
const EXTENSIONS: &[&str] = &[
  "md",
  "markdown",
  "ics",
  "pdf",
  "drawio",
  "excalidraw",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "tsv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "mp4",
  "webm",
  "mov",
];
struct Candidate<'a> {
  path: &'a str,
  label: &'a str,
  same_dir: bool,
  depth: usize,
  rank: f64,
}
pub(super) fn completions(
  index: &Index,
  source: &str,
  query: &str,
  wiki: bool,
  position: Position,
  start: usize,
) -> Vec<Value> {
  let query = query.trim().to_lowercase();
  let directory = source.rsplit_once('/').map_or("", |(parent, _)| parent);
  let paths: BTreeSet<_> = index
    .paths
    .iter()
    .chain(index.files.keys())
    .map(String::as_str)
    .collect();
  let mut candidates: Vec<_> = paths
    .into_iter()
    .filter(|path| eligible(path, wiki))
    .map(|path| Candidate {
      path,
      label: label(path),
      depth: path.split('/').count(),
      rank: 0.0,
      same_dir: !directory.is_empty()
        && path
          .strip_prefix(directory)
          .is_some_and(|tail| tail.starts_with('/')),
    })
    .collect();
  candidates.sort_by(compare);
  // Direct matches always consider every path. Approximate matching has a
  // bounded candidate/window budget so typing cannot trigger unbounded work.
  let mut fuzzy_budget = 1024usize;
  candidates.retain_mut(|candidate| {
    if query.is_empty() {
      return true;
    }
    let label = candidate.label.to_lowercase();
    let path = candidate.path.to_lowercase();
    let direct = label.contains(&query) || path.contains(&query);
    let score = if direct {
      Some(0.001)
    } else if fuzzy_budget > 0 {
      fuzzy_budget -= 1;
      fuzzy_score(&query, &label, 0.45)
        .into_iter()
        .chain(fuzzy_score(&query, &path, 0.45))
        .reduce(f64::min)
    } else {
      None
    };
    let Some(score) = score else {
      return false;
    };
    let bonus = if label == query {
      -18.0
    } else if label.starts_with(&query) {
      -12.0
    } else if path.starts_with(&query) {
      -8.0
    } else if label.contains(&query) {
      -5.0
    } else {
      0.0
    };
    candidate.rank =
      if candidate.same_dir { 0.0 } else { 35.0 } + score * 70.0 + bonus + candidate.depth as f64;
    true
  });
  if !query.is_empty() {
    candidates.sort_by(|a, b| a.rank.total_cmp(&b.rank).then_with(|| compare(a, b)));
  }
  candidates
    .into_iter()
    .take(LIMIT)
    .map(|candidate| completion_item(candidate, source, &query, wiki, position, start))
    .collect()
}
fn completion_item(
  candidate: Candidate<'_>,
  source: &str,
  query: &str,
  wiki: bool,
  position: Position,
  start: usize,
) -> Value {
  let text = if wiki {
    candidate.label.to_owned()
  } else {
    relative(source, candidate.path)
  };
  let mut value = item(candidate.label, &text, candidate.path, 17, position, start);
  let label = candidate.label.to_lowercase();
  let relevance = if query.is_empty() || label == query {
    0
  } else if label.starts_with(query) {
    5
  } else if candidate.path.to_lowercase().starts_with(query) {
    10
  } else if label.contains(query) {
    20
  } else {
    30
  };
  let score = (if candidate.same_dir { 0 } else { 40 }) + candidate.depth + relevance;
  value["sortText"] = json!(format!("{score:04}-{}-{}", candidate.label, candidate.path));
  value["documentation"] =
    json!({"kind":"markdown","value":format!("**{}**\n\n`{}`", candidate.label, candidate.path)});
  value
}
fn eligible(path: &str, wiki: bool) -> bool {
  let extension = path
    .rsplit_once('.')
    .map(|(_, extension)| extension.to_ascii_lowercase());
  extension.as_deref().is_some_and(|extension| {
    if wiki {
      matches!(extension, "md" | "markdown")
    } else {
      EXTENSIONS.contains(&extension)
    }
  })
}
fn label(path: &str) -> &str {
  let name = path.rsplit('/').next().unwrap_or(path);
  match name.rsplit_once('.') {
    Some((base, extension))
      if ["md", "markdown", "ics"]
        .iter()
        .any(|value| extension.eq_ignore_ascii_case(value)) =>
    {
      base
    }
    _ => name,
  }
}
fn compare(a: &Candidate<'_>, b: &Candidate<'_>) -> Ordering {
  b.same_dir
    .cmp(&a.same_dir)
    .then(a.depth.cmp(&b.depth))
    .then_with(|| a.label.to_lowercase().cmp(&b.label.to_lowercase()))
    .then(a.label.cmp(b.label))
    .then(a.path.cmp(b.path))
}
pub(super) fn fuzzy_score(query: &str, text: &str, threshold: f64) -> Option<f64> {
  let query_chars = query.chars().take(33).count();
  if !(2..=32).contains(&query_chars) {
    return None;
  }
  let chars: Vec<_> = text.chars().take(129).collect();
  if chars.len() > 128 {
    return None;
  }
  if text.contains(query) {
    return Some(0.001);
  }
  let tokens: Vec<_> = query.split_whitespace().take(5).collect();
  if (2..=4).contains(&tokens.len()) && tokens.iter().all(|token| text.contains(token)) {
    return Some(0.001);
  }
  let errors = (query_chars as f64 * threshold) as usize;
  let mut remaining = 32usize;
  let mut best: Option<f64> = None;
  for start in 0..chars.len() {
    for width in
      query_chars.saturating_sub(errors).max(1)..=(query_chars + errors).min(chars.len() - start)
    {
      if remaining == 0 {
        return best;
      }
      remaining -= 1;
      let fragment: String = chars[start..start + width].iter().collect();
      let score = strsim::levenshtein(query, &fragment) as f64 / query_chars as f64;
      if score <= threshold {
        best = Some(best.map_or(score, |previous| previous.min(score)));
      }
    }
  }
  best
}
fn relative(source: &str, target: &str) -> String {
  let source: Vec<_> = source
    .rsplit_once('/')
    .map_or("", |(parent, _)| parent)
    .split('/')
    .filter(|part| !part.is_empty())
    .collect();
  let target: Vec<_> = target.split('/').collect();
  let common = source
    .iter()
    .zip(&target)
    .take_while(|(a, b)| a == b)
    .count();
  let mut output = vec![".."; source.len() - common];
  output.extend_from_slice(&target[common..]);
  output.join("/")
}
