mod build;
mod cache;
pub mod commands;
pub mod document;
mod graph;
mod graph_storage;
mod queries;
mod search;
mod service;
mod status;
mod storage;
pub mod targets;
pub use queries::diagnostics;
pub use service::{AnalysisService, Index};

#[cfg(test)]
mod tests;

#[cfg(test)]
mod cache_tests;

#[cfg(test)]
mod storage_tests;
