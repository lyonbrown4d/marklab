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

## Workspace sidecar gRPC scaffold

The workspace sidecar roadmap now has a first gRPC/protobuf scaffold without switching the
runtime path away from the existing JSON-RPC sidecar. The proto source of truth lives in
`knowledge-engine/proto`, Rust generated bindings are compiled by the `marklab-knowledge-grpc-api`
crate, and Node generation is wired through Buf plus `ts-proto`.

This phase intentionally keeps the current Electron main process on the stable JSON-RPC bridge.
The next migration step is to introduce a `WorkspaceSidecarManager` that can own one sidecar per
workspace, then route either JSON-RPC or gRPC behind the same Electron service boundary while the
transport is migrated.

### Rust dependency scaffold notes

The gRPC/protobuf scaffold now has explicit Rust dependencies for `tokio`, `tonic`, `prost`,
`tonic-health`, and `tokio-util`. The Markdown syntax scaffold now uses `ropey`,
`pulldown-cmark`, `unicode-normalization`, and `unicode-segmentation` in the default build.

`tree-sitter` and `tree-sitter-md` are present as the optional `tree-sitter-markdown` feature.
They are intentionally not enabled by default yet because the Windows MSVC build requires a valid
C compiler environment. Enabling that feature should be paired with a toolchain preflight script
instead of relying on machine-specific compiler paths.

### FluxDI composition boundary

`fluxdi` is now part of the Rust workspace as the `app-composition` boundary. The initial crate is
intentionally thin: it owns the workspace composition configuration and re-exports FluxDI for the
future composition root, while `engine-core` remains free of DI dependencies.

The next step is to move sidecar startup wiring into this composition crate, then register storage,
Markdown language services, gRPC adapters, and job services there. Domain crates should continue to
receive explicit dependencies and must not resolve services from the injector at runtime.

### FluxDI placement update

FluxDI is intentionally used from the `knowledge-engine` binary composition module instead of a
standalone composition crate. This keeps dependency injection at the process composition root and
prevents DI APIs from leaking into `engine-core`, `grpc-api`, or `rpc-server`.

The binary currently creates a lightweight workspace composition root from sidecar environment
variables. Future startup wiring should register concrete services there while domain crates remain
constructor-driven and explicit.

### WorkspaceSidecarManager scaffold

Electron main now has a `WorkspaceSidecarManager` boundary for workspace runtime routing. The current
implementation deliberately keeps the existing shared JSON-RPC sidecar transport so the app runtime
is not switched in the same step as the architecture refactor.

Responsibilities now owned by the manager boundary:

- workspace open/close lifecycle tracking;
- workspace request routing with explicit `workspaceId` attachment;
- active runtime listing for diagnostics;
- a stable seam for replacing shared JSON-RPC with one child process / gRPC channel per workspace.

The next migration step is to turn each runtime entry into a real sidecar process handle with its
own environment, session token, readiness state, and transport channel.

### Workspace sidecar identity model

The manager now creates a per-workspace identity plan before opening a runtime. It computes a stable
`workspaceInstanceId`, canonical workspace root, engine data directory, and session token based on
the workspace key and index path. Runtime diagnostics intentionally omit the session token and full
environment payload.

Current transport still uses the shared JSON-RPC sidecar. The identity model is ready for the next
step where each runtime entry becomes an actual child process with these environment variables:
`WORKSPACE_ROOT`, `WORKSPACE_INSTANCE_ID`, `ENGINE_DATA_DIR`, and `GRPC_SESSION_TOKEN`.
