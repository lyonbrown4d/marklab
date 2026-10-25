//! Desktop adapter for the shared, host-independent document parser.
use crate::error::BackendResult;
pub use marklab_document::analysis::{Document, Heading, Link, LinkKind, position, slug};

pub fn parse(path: String, content: String) -> BackendResult<Document> {
  marklab_document::analysis::parse(path, content).map_err(Into::into)
}
