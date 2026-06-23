use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct SearchDocument {
  pub path: String,
  pub title: String,
  pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchOrder {
  Score,
  Path,
  Title,
  PathThenScore,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchQuery {
  pub query: String,
  pub limit: usize,
  pub offset: usize,
  pub include_paths: Vec<String>,
  pub order: SearchOrder,
  pub include_total_hits: bool,
}

impl SearchQuery {
  pub fn new(query: impl Into<String>, limit: usize) -> Self {
    Self {
      query: query.into(),
      limit: limit.clamp(1, 100),
      offset: 0,
      include_paths: Vec::new(),
      order: SearchOrder::Score,
      include_total_hits: true,
    }
  }
}

#[derive(Debug)]
pub struct SearchResultSet<T> {
  pub results: Vec<T>,
  pub total_hits: usize,
}
