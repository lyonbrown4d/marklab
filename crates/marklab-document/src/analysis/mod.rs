//! Pure Markdown document analysis, source positions, and heading slugs.
//!
//! Parsing accepts an explicit path label and source text; it performs no I/O,
//! workspace indexing, database access, or link target resolution.
pub mod document;

pub use document::{Document, Heading, Link, LinkKind, parse, position, slug};
