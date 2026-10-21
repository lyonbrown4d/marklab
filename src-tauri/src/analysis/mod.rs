mod build;
mod cache;
pub mod commands;
pub mod document;
mod graph;
mod graph_preview;
mod graph_storage;
mod graph_types;
mod projections;
mod publication;
mod queries;
mod query_details;
mod query_types;
mod search;
mod search_fuzzy;
mod search_matches;
#[cfg(test)]
mod search_tests;
mod search_text;
mod service;
mod status;
mod status_types;
mod storage;
pub mod targets;
pub use queries::diagnostics;
pub use search::{Highlight, SearchResult};
pub use search_matches::CountedSearch;
pub use service::{AnalysisService, Index};
pub use status::LogicalStorageStats;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod cache_tests;

#[cfg(test)]
mod storage_tests;
