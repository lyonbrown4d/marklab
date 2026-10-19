use super::search_fuzzy::FuzzyBudget;
use super::{
  document::Document,
  search::{Highlight, SearchResult},
  search_matches::{check, complex},
};
use crate::error::{BackendError, BackendResult};
use std::sync::atomic::AtomicBool;
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

pub(super) fn fold(value: &str) -> String {
  let mut result = String::with_capacity(value.len());
  for ch in value.nfkd().filter(|ch| !is_combining_mark(*ch)) {
    append(ch, &mut result);
  }
  result
}

fn append(ch: char, result: &mut String) {
  match ch {
    'ø' | 'Ø' => result.push('o'),
    'ł' | 'Ł' => result.push('l'),
    'ð' | 'Ð' => result.push('d'),
    'þ' | 'Þ' => result.push_str("th"),
    'ß' => result.push_str("ss"),
    'æ' | 'Æ' => result.push_str("ae"),
    'œ' | 'Œ' => result.push_str("oe"),
    _ => result.extend(ch.to_lowercase()),
  }
}

fn fold_checked(value: &str, cancelled: &AtomicBool) -> BackendResult<String> {
  let mut result = String::with_capacity(value.len().min(64 * 1024 * 1024));
  for (index, ch) in value.nfkd().enumerate() {
    if index.is_multiple_of(4096) {
      check(cancelled)?;
    }
    if !is_combining_mark(ch) {
      append(ch, &mut result);
    }
    if result.len() > 64 * 1024 * 1024 {
      return Err(complex());
    }
  }
  Ok(result)
}

pub(super) fn terms(query: &str) -> BackendResult<Vec<String>> {
  if query.trim().is_empty() || query.len() > 1024 {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Search query must contain 1 to 1024 bytes",
    ));
  }
  let terms: Vec<String> = fold(query).split_whitespace().map(str::to_owned).collect();
  if terms.len() > 32 {
    return Err(complex());
  }
  Ok(terms)
}

pub(super) fn match_document(
  file: &Document,
  terms: &[String],
  budget: &mut FuzzyBudget,
  cancelled: &AtomicBool,
) -> BackendResult<Option<SearchResult>> {
  if terms.is_empty() {
    return Ok(None);
  }
  let title = fold_checked(&file.title, cancelled)?;
  let path = fold(&file.path);
  let content = fold_checked(&file.content, cancelled)?;
  let contains = |term: &str| title.contains(term) || path.contains(term) || content.contains(term);
  let mut matched = Vec::new();
  for term in terms {
    check(cancelled)?;
    if contains(term) {
      matched.push(term.clone());
      continue;
    }
    let Some(word) = budget.find(&[&title, &path, &content], term, cancelled)? else {
      return Ok(None);
    };
    matched.push(word);
  }
  let score = terms
    .iter()
    .map(|term| {
      12 * usize::from(title.contains(term))
        + 8 * usize::from(path.contains(term))
        + 4 * usize::from(content.contains(term))
    })
    .sum::<usize>() as f64;
  let (line, text, folded) = if terms.iter().all(|term| title.contains(term)) {
    (0, file.title.as_str(), title.clone())
  } else {
    snippet_line(&file.content, terms, &matched, cancelled)?
  };
  let first = matched
    .iter()
    .filter_map(|term| folded.find(term).map(|start| (start, term.len())))
    .min();
  let first = match first {
    Some((start, length)) => source_span_at(text, start, start + length, cancelled)?,
    None => None,
  };
  let offset = first.map_or(0, |(start, _)| {
    text[..start].chars().count().saturating_sub(80)
  });
  let snippet: String = text.chars().skip(offset).take(240).collect();
  let mut highlights: Vec<Highlight> = terms
    .iter()
    .chain(&matched)
    .filter_map(|term| source_span(&snippet, term))
    .map(|(start, end)| Highlight {
      start: snippet[..start].encode_utf16().count(),
      end: snippet[..end].encode_utf16().count(),
    })
    .collect();
  highlights.sort_by_key(|span| (span.start, span.end));
  highlights.dedup_by_key(|span| (span.start, span.end));
  let skipped = text
    .chars()
    .take(offset)
    .map(char::len_utf16)
    .sum::<usize>();
  let (column, end_column) = highlights.first().map_or((1, 1), |span| {
    (skipped + span.start + 1, skipped + span.end + 1)
  });
  Ok(Some(SearchResult {
    path: file.path.clone(),
    title: file.title.clone(),
    line: line + 1,
    column,
    end_column,
    snippet,
    snippet_highlights: highlights,
    score,
  }))
}

fn snippet_line<'a>(
  content: &'a str,
  terms: &[String],
  matched: &[String],
  cancelled: &AtomicBool,
) -> BackendResult<(usize, &'a str, String)> {
  let mut first = None;
  for (line, text) in content.lines().enumerate() {
    check(cancelled)?;
    let folded = fold_checked(text, cancelled)?;
    if terms.iter().all(|term| folded.contains(term)) {
      return Ok((line, text, folded));
    }
    if first.is_none() && matched.iter().any(|term| folded.contains(term)) {
      first = Some((line, text, folded));
    }
  }
  Ok(first.unwrap_or((0, "", String::new())))
}

// Map normalized byte offsets to UTF-8 boundaries without an offset array for
// a potentially large source line. Snippets remain bounded to 240 characters.
fn source_span(text: &str, term: &str) -> Option<(usize, usize)> {
  let folded = fold(text);
  let start = folded.find(term)?;
  let end = start + term.len();
  source_span_at(text, start, end, &AtomicBool::new(false))
    .ok()
    .flatten()
}

fn source_span_at(
  text: &str,
  start: usize,
  end: usize,
  cancelled: &AtomicBool,
) -> BackendResult<Option<(usize, usize)>> {
  let mut position = 0;
  let mut source_start = None;
  let mut source_end = 0;
  for (index, (offset, ch)) in text.char_indices().enumerate() {
    if index.is_multiple_of(4096) {
      check(cancelled)?;
    }
    let mut buffer = [0; 4];
    let length = fold(ch.encode_utf8(&mut buffer)).len();
    if position <= start && start < position + length {
      source_start = Some(offset);
    }
    if (position < end && position + length >= end)
      || (length == 0 && position == end && is_combining_mark(ch))
    {
      source_end = offset + ch.len_utf8();
    }
    position += length;
    if position > end {
      break;
    }
  }
  Ok(source_start.map(|start| (start, source_end)))
}
