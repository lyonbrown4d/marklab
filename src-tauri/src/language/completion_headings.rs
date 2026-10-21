use super::{Position, files, item};
use crate::analysis::document::Document;
use lsp_types::{CompletionItem, CompletionItemKind};

pub(super) fn completions(
  file: &Document,
  query: &str,
  position: Position,
  start: usize,
) -> Vec<CompletionItem> {
  let query = query.trim().to_lowercase();
  let mut fuzzy_budget = 1024usize;
  let mut headings: Vec<_> = file
    .headings
    .iter()
    .filter_map(|heading| {
      if query.is_empty() {
        return Some((heading, 0.0));
      }
      let text = heading.text.to_lowercase();
      let slug = heading.slug.to_lowercase();
      let direct = text.contains(&query) || slug.contains(&query);
      let score = if direct {
        Some(0.001)
      } else if fuzzy_budget > 0 {
        fuzzy_budget -= 1;
        files::fuzzy_score(&query, &text, 0.6)
          .into_iter()
          .chain(files::fuzzy_score(&query, &slug, 0.6))
          .reduce(f64::min)
      } else {
        None
      }?;
      let bonus = if text == query || slug == query {
        -18.0
      } else if text.starts_with(&query) || slug.starts_with(&query) {
        -12.0
      } else if text.contains(&query) || slug.contains(&query) {
        -5.0
      } else {
        0.0
      };
      Some((heading, score * 70.0 + bonus))
    })
    .collect();
  if !query.is_empty() {
    headings.sort_by(|(a, rank_a), (b, rank_b)| rank_a.total_cmp(rank_b).then(a.text.cmp(&b.text)));
  }
  headings
    .into_iter()
    .map(|(heading, _)| {
      let mut value = item(
        &heading.text,
        &heading.slug,
        &format!("{}#{}", file.path, heading.slug),
        CompletionItemKind::REFERENCE,
        position,
        start,
      );
      let text = heading.text.to_lowercase();
      let score = if query.is_empty() {
        10
      } else if text == query || heading.slug == query {
        0
      } else if text.starts_with(&query) || heading.slug.starts_with(&query) {
        5
      } else if text.contains(&query) || heading.slug.contains(&query) {
        15
      } else {
        30
      };
      value.sort_text = Some(format!("{score:04}-{}", heading.text));
      value
    })
    .collect()
}
