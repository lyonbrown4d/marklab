mod markdown_documents;
mod markdown_extract;
mod markdown_syntax;
mod metadata_store;
mod outbox;
mod search_text;
mod types;
mod workspace_engine;
#[cfg(test)]
mod workspace_engine_tests;
mod workspace_store;

pub use types::SearchDocument;
pub use types::{SearchOrder, SearchQuery, SearchResultSet};
pub use workspace_engine::{
  WorkspaceDocumentChange, WorkspaceDocumentEdit, WorkspaceDocumentPosition,
  WorkspaceDocumentRange, WorkspaceEngine, WorkspaceMarkdownLink, WorkspaceMarkdownSymbol,
  WorkspaceSearchHighlight, WorkspaceSearchResult,
};
