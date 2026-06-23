mod engine;
mod markdown_documents;
mod markdown_extract;
mod markdown_syntax;
pub mod metadata_store;
pub mod outbox;
mod search_text;
mod types;
mod workspace_engine;
mod workspace_store;

pub use engine::KnowledgeEngine;
pub use workspace_engine::{
  WorkspaceEngine, WorkspaceMarkdownLink, WorkspaceMarkdownSymbol, WorkspaceSearchHighlight,
  WorkspaceSearchResult,
};

#[cfg(test)]
mod engine_tests;
