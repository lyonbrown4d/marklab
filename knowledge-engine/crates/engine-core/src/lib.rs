mod markdown_blocks;
mod markdown_documents;
mod markdown_extract;
mod markdown_graph;
mod markdown_graph_paths;
mod markdown_syntax;
mod metadata_store;
mod outbox;
mod search_text;
mod types;
mod workspace_engine;
#[cfg(test)]
mod workspace_engine_tests;
mod workspace_store;

pub use markdown_blocks::{MarkdownGraphBlock, MarkdownGraphBlockKind};
pub use markdown_graph::{
  WorkspaceGraph, WorkspaceGraphDocument, WorkspaceGraphEdge, WorkspaceGraphEdgeKind,
  WorkspaceGraphKnownPaths, WorkspaceGraphMode, WorkspaceGraphNode, WorkspaceGraphNodeKind,
};
pub use types::SearchDocument;
pub use types::{SearchOrder, SearchQuery, SearchResultSet};
pub use workspace_engine::{
  WorkspaceDocumentChange, WorkspaceDocumentEdit, WorkspaceDocumentPosition,
  WorkspaceDocumentRange, WorkspaceEngine, WorkspaceHealthSnapshot, WorkspaceIndexStatus,
  WorkspaceMarkdownLink, WorkspaceMarkdownSymbol, WorkspaceSearchHighlight, WorkspaceSearchResult,
  WorkspaceStatusSnapshot, WorkspaceStorageStats,
};
