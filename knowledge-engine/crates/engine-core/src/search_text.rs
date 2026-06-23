use serde_json::{json, Value};

use crate::types::{SearchDocument, SearchOrder, SearchQuery, SearchResultSet};

pub(crate) fn search_documents<'a>(
  documents: impl IntoIterator<Item = &'a SearchDocument>,
  query: &SearchQuery,
) -> SearchResultSet<Value> {
  let terms = query_terms(&query.query);
  if terms.is_empty() {
    return SearchResultSet {
      results: Vec::new(),
      total_hits: 0,
    };
  }

  let limit = query.limit.clamp(1, 100);
  let offset = query.offset;

  let mut results: Vec<SearchHit> = documents
    .into_iter()
    .filter(|document| include_document_path(document.path.as_str(), &query.include_paths))
    .filter_map(|document| search_document(document, &terms))
    .collect();

  sort_search_results(&mut results, query.order);
  let total_hits = results.len();
  let selected = results
    .into_iter()
    .skip(offset)
    .take(limit)
    .map(SearchHit::to_json)
    .collect();

  SearchResultSet {
    results: selected,
    total_hits,
  }
}

fn include_document_path(path: &str, include_paths: &[String]) -> bool {
  if include_paths.is_empty() {
    return true;
  }

  include_paths
    .iter()
    .any(|include| path.starts_with(include))
}

fn sort_search_results(results: &mut [SearchHit], order: SearchOrder) {
  results.sort_by(|left, right| match order {
    SearchOrder::Path => left.path.cmp(&right.path).then_with(|| {
      right
        .score
        .cmp(&left.score)
        .then_with(|| left.title.cmp(&right.title))
    }),
    SearchOrder::Title => left.title.cmp(&right.title).then_with(|| {
      right
        .score
        .cmp(&left.score)
        .then_with(|| left.path.cmp(&right.path))
    }),
    SearchOrder::PathThenScore => left
      .path
      .cmp(&right.path)
      .then_with(|| right.score.cmp(&left.score)),
    SearchOrder::Score => right
      .score
      .cmp(&left.score)
      .then_with(|| left.path.cmp(&right.path)),
  })
}

fn search_document(document: &SearchDocument, terms: &[String]) -> Option<SearchHit> {
  let title = title_for_document(document);
  let folded_title = fold_text(&title);
  let folded_path = fold_text(&document.path);
  let folded_content = fold_text(&document.content);
  let haystack = format!("{folded_title}\n{folded_path}\n{folded_content}");

  if !terms.iter().all(|term| haystack.contains(term)) {
    return None;
  }

  let snippet = best_snippet(document, &title, terms);
  let highlights = highlights_for_snippet(&snippet, terms);
  let title_score = terms
    .iter()
    .filter(|term| folded_title.contains(term.as_str()))
    .count();
  let path_score = terms
    .iter()
    .filter(|term| folded_path.contains(term.as_str()))
    .count();
  let content_score = terms
    .iter()
    .filter(|term| folded_content.contains(term.as_str()))
    .count();

  Some(SearchHit {
    path: document.path.clone(),
    title,
    line: line_for_snippet(&document.content, &snippet),
    column: 1,
    end_column: 1,
    snippet,
    snippet_highlights: highlights,
    score: (title_score * 12 + path_score * 8 + content_score * 4) as i64,
  })
}

fn query_terms(query: &str) -> Vec<String> {
  fold_text(query)
    .split_whitespace()
    .map(str::trim)
    .filter(|term| !term.is_empty())
    .map(ToOwned::to_owned)
    .collect()
}

fn title_for_document(document: &SearchDocument) -> String {
  if let Some(file_name) = document.path.rsplit(['/', '\\']).next() {
    if let Some((stem, _extension)) = file_name.rsplit_once('.') {
      return stem.to_string();
    }
  }

  if document.title.trim().is_empty() {
    document.path.clone()
  } else {
    document.title.clone()
  }
}

fn best_snippet(document: &SearchDocument, title: &str, terms: &[String]) -> String {
  let folded_title = fold_text(title);
  if terms.iter().any(|term| folded_title.contains(term)) {
    return title.to_string();
  }

  document
    .content
    .lines()
    .find(|line| {
      let folded_line = fold_text(line);
      terms.iter().any(|term| folded_line.contains(term))
    })
    .unwrap_or(title)
    .to_string()
}

fn line_for_snippet(content: &str, snippet: &str) -> usize {
  content
    .lines()
    .position(|line| line == snippet)
    .map(|line| line + 1)
    .unwrap_or(1)
}

fn highlights_for_snippet(snippet: &str, terms: &[String]) -> Vec<Value> {
  let folded_snippet = fold_text(snippet);
  terms
    .iter()
    .filter_map(|term| {
      folded_snippet
        .find(term)
        .map(|start| json!({ "start": start, "end": start + term.len() }))
    })
    .collect()
}

fn fold_text(value: &str) -> String {
  let mut output = String::with_capacity(value.len());

  for ch in value.chars() {
    if let Some(replacement) = fold_accent(ch) {
      output.push_str(replacement);
      continue;
    }

    for lowered in ch.to_lowercase() {
      output.push(lowered);
    }
  }

  output
}

fn fold_accent(value: char) -> Option<&'static str> {
  match value {
    'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å'
    | 'Ā' | 'Ă' | 'Ą' => Some("a"),
    'ç' | 'ć' | 'ĉ' | 'ċ' | 'č' | 'Ç' | 'Ć' | 'Ĉ' | 'Ċ' | 'Č' => Some("c"),
    'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' | 'È' | 'É' | 'Ê' | 'Ë' | 'Ē' | 'Ĕ'
    | 'Ė' | 'Ę' | 'Ě' => Some("e"),
    'ì' | 'í' | 'î' | 'ï' | 'ĩ' | 'ī' | 'ĭ' | 'į' | 'Ì' | 'Í' | 'Î' | 'Ï' | 'Ĩ' | 'Ī' | 'Ĭ'
    | 'Į' => Some("i"),
    'ñ' | 'ń' | 'ņ' | 'ň' | 'Ñ' | 'Ń' | 'Ņ' | 'Ň' => Some("n"),
    'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' | 'ŏ' | 'ő' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø'
    | 'Ō' | 'Ŏ' | 'Ő' => Some("o"),
    'ù' | 'ú' | 'û' | 'ü' | 'ũ' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' | 'Ù' | 'Ú' | 'Û' | 'Ü' | 'Ũ'
    | 'Ū' | 'Ŭ' | 'Ů' | 'Ű' | 'Ų' => Some("u"),
    'ý' | 'ÿ' | 'ŷ' | 'Ý' | 'Ŷ' => Some("y"),
    _ => None,
  }
}

#[derive(Debug)]
struct SearchHit {
  path: String,
  title: String,
  line: usize,
  column: usize,
  end_column: usize,
  snippet: String,
  snippet_highlights: Vec<Value>,
  score: i64,
}

impl SearchHit {
  fn to_json(self) -> Value {
    json!({
        "path": self.path,
        "title": self.title,
        "line": self.line,
        "column": self.column,
        "end_column": self.end_column,
        "snippet": self.snippet,
        "snippet_highlights": self.snippet_highlights,
        "score": self.score,
    })
  }
}
