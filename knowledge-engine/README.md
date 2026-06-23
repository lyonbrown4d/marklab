# Marklab Knowledge Engine

This directory contains the Rust sidecar crates that will eventually own durable
knowledge metadata, full-text indexing, embedded Markdown language features,
and incremental graph projections.

The Cargo workspace is rooted at the repository `Cargo.toml`.

Current phase:

- stdio JSON-RPC skeleton
- `initialize`, `knowledge/health`, and `shutdown` methods
- no database or index dependency yet

Planned next layers:

- redb-backed metadata store
- Tantivy-backed full-text index
- transactional outbox between metadata and search
- embedded Markdown LSP services
- Electron lifecycle supervision
