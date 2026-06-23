# Marklab Knowledge Engine

This directory contains the Rust sidecar crates that own durable knowledge
metadata, full-text indexing, embedded Markdown language features, and
incremental graph projections.

The Cargo workspace is rooted at the repository `Cargo.toml`.

Current phase:

- workspace-scoped gRPC sidecar
- token-authenticated Control, Workspace, Search, DocumentSession, and Markdown services
- redb-backed metadata storage
- Tantivy-backed full-text search
- in-memory Markdown overlay for document symbols and links

Planned next layers:

- transactional outbox between metadata and search
- deeper embedded Markdown LSP services
- sidecar integration tests against the packaged binary
