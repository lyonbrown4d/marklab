use super::{AnalysisService, Index, SearchResult, search_text};
use crate::error::{BackendError, BackendResult};
use sqlx::Row;
use std::{
  collections::BTreeSet,
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
};

pub struct CountedSearch {
  pub results: Vec<SearchResult>,
  pub total_hits: usize,
}

impl AnalysisService {
  pub async fn counted_search(
    &self,
    index: Arc<Index>,
    query: String,
    limit: usize,
    cancelled: Arc<AtomicBool>,
  ) -> BackendResult<CountedSearch> {
    let terms = search_text::terms(&query)?;
    if !(1..=500).contains(&limit) {
      return Err(complex());
    }
    let selected = {
      let _build = self.build.lock().await;
      check(&cancelled)?;
      // FTS is an ordering aid. A candidate cap must never truncate totals
      // or exclude substring, CJK, accent or zero-trigram fuzzy matches.
      if self.persisted_index_matches(&index).await {
        let expression = terms
          .iter()
          .map(|term| format!("\"{}\"*", term.replace('"', "\"\"")))
          .collect::<Vec<_>>()
          .join(" AND ");
        sqlx::query("SELECT path FROM analysis_fts WHERE analysis_fts MATCH ? AND scope=? ORDER BY bm25(analysis_fts) LIMIT 2000")
                    .bind(expression).bind(&index.scope).fetch_all(&self.pool).await
                    .map(|rows| rows.into_iter().filter_map(|row| row.try_get::<String,_>("path").ok()).collect::<BTreeSet<_>>())
                    .unwrap_or_default()
      } else {
        BTreeSet::new()
      }
    };
    let worker = self
      .workers
      .clone()
      .acquire_owned()
      .await
      .map_err(|_| BackendError::new("SEARCH_UNAVAILABLE", "Search worker unavailable"))?;
    tokio::task::spawn_blocking(move || {
      let _worker = worker;
      scan(&index, &terms, limit, &selected, &cancelled)
    })
    .await
    .map_err(|_| BackendError::new("SEARCH_FAILED", "Search worker failed"))?
  }
}

pub(super) fn scan(
  index: &Index,
  terms: &[String],
  limit: usize,
  selected: &BTreeSet<String>,
  cancelled: &AtomicBool,
) -> BackendResult<CountedSearch> {
  let mut results: Vec<SearchResult> = Vec::new();
  let mut total_hits = 0;
  let mut budget = super::search_fuzzy::FuzzyBudget::new(8_000_000);
  for file in index
    .files
    .values()
    .filter(|file| selected.contains(&file.path))
    .chain(
      index
        .files
        .values()
        .filter(|file| !selected.contains(&file.path)),
    )
  {
    check(cancelled)?;
    let Some(hit) = search_text::match_document(file, terms, &mut budget, cancelled)? else {
      continue;
    };
    total_hits += 1;
    let position = results.partition_point(|old| {
      old.score > hit.score || (old.score == hit.score && old.path < hit.path)
    });
    if position < limit {
      results.insert(position, hit);
      results.truncate(limit);
    }
  }
  check(cancelled)?;
  Ok(CountedSearch {
    results,
    total_hits,
  })
}

pub(super) fn check(cancelled: &AtomicBool) -> BackendResult<()> {
  if cancelled.load(Ordering::Acquire) {
    Err(BackendError::new(
      "MCP_CANCELLED",
      "Search request cancelled",
    ))
  } else {
    Ok(())
  }
}

pub(super) fn complex() -> BackendError {
  BackendError::new(
    "SEARCH_TOO_COMPLEX",
    "Search comparison budget exceeded; use shorter or more specific terms",
  )
}
