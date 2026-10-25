pub use AnalysisLinkKind as LinkKind;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "lowercase")]
pub enum AnalysisLinkKind {
  Markdown,
  Wiki,
}
impl LinkKind {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Markdown => "markdown",
      Self::Wiki => "wiki",
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Heading {
  pub path: String,
  pub slug: String,
  pub text: String,
  pub level: u8,
  pub line: usize,
  pub column: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Link {
  pub source_path: String,
  pub target: String,
  pub text: String,
  pub context: String,
  pub line: usize,
  pub column: usize,
  pub link_type: LinkKind,
  #[serde(default)]
  pub target_path: Option<String>,
  #[serde(default)]
  pub target_anchor: Option<String>,
  #[serde(default)]
  pub target_heading_slug: Option<String>,
  pub is_external: bool,
  #[serde(skip)]
  pub offset: usize,
  #[serde(skip)]
  pub end_offset: usize,
  #[serde(skip)]
  pub span_start: usize,
  #[serde(skip)]
  pub span_end: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Document {
  pub path: String,
  pub title: String,
  pub content: Arc<str>,
  pub headings: Vec<Heading>,
  pub links: Vec<Link>,
  pub assets: Vec<Link>,
  pub word_count: usize,
}
