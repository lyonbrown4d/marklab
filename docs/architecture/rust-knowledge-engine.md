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
