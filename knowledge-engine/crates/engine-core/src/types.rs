use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct SearchDocument {
  pub path: String,
  pub title: String,
  pub content: String,
}
