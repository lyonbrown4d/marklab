# Rust Knowledge Engine

Marklab is moving durable knowledge features into a Rust sidecar that is
supervised by the Electron main process.

## Current phase

The first implementation is intentionally small:

- root Cargo workspace with sidecar crates in `knowledge-engine/`
- stdio JSON-RPC transport
- `initialize`, `knowledge/health`, and `shutdown`
- Electron main-process supervisor
- dev/build script that produces `resources/engine/<platform>-<arch>/knowledge-engine`

The sidecar is required in development. `pnpm electron:dev` runs
`pnpm knowledge:build` before starting Vite/Electron.

## Runtime contract

Renderer code does not talk to the sidecar directly.

Electron main owns:

- process lifecycle
- binary resolution
- JSON-RPC request routing
- workspace open/close lifecycle and sidecar handle release
- shutdown cleanup

Renderer features must go through existing typed command IPC and domain
services.

## Next phases

1. Add redb metadata store for document records, edges, symbols, and outbox.
2. Add Tantivy full-text index behind the sidecar instead of SQLite FTS.
3. Add transactional outbox replay from metadata changes into search index.
4. Move Markdown language intelligence into the embedded Rust service.
5. Add workspace open/close and incremental file scan commands.
6. Add crash recovery, health telemetry, and bounded memory controls.

## Markdown LSP direction

Markdown LSP should be an adapter over the same canonical semantic model used by
search and graph features.

The implementation order is:

1. `markdown/extract` produces headings, links, and stable source positions.
2. Persist document metadata, symbols, and edges in redb.
3. Add read-only LSP adapters for document symbols, definitions, references,
   hover, diagnostics, and completion.
4. Add open document overlay so unsaved content participates in LSP and search.
5. Move write operations such as rename and code actions last; Electron remains
   responsible for file permissions and buffer writes.

## Embedded Markdown LSP progress

The knowledge engine now owns a minimal open document overlay for Markdown files.
This follows the technical design direction that editor state, Markdown extraction,
search metadata, and graph metadata should converge inside the Rust engine instead
of remaining split across renderer and Node services.

Current sidecar JSON-RPC methods:

- `markdown/extract`: stateless heading and link extraction for a supplied document.
- `markdown/didOpen`: stores an opened Markdown snapshot in the Rust overlay.
- `markdown/didChange`: replaces the opened Markdown snapshot and recomputes symbols/links.
- `markdown/didClose`: removes the opened Markdown snapshot from the overlay.
- `markdown/documentSymbols`: returns heading symbols from the opened snapshot.
- `markdown/links`: returns Markdown and wiki links from the opened snapshot.

The implementation is intentionally small for this phase. The next step from the
technical design is to replace the line-oriented extractor internals with a proper
parser/rope stack, likely `ropey` for document text and either tree-sitter Markdown
or a maintained Markdown parser for richer incremental syntax features. The public
JSON-RPC shape should remain stable while the parser internals improve.
