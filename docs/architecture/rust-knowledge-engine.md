# Rust Knowledge Engine

Marklab is moving durable knowledge features into a Rust sidecar that is
supervised by the Electron main process.

## Current phase

The first implementation is intentionally small:

- root Cargo workspace with sidecar crates in `knowledge-engine/`
- workspace-scoped gRPC transport
- token-authenticated Control, Workspace, Search, DocumentSession, and Markdown gRPC services
- Electron main-process supervisor
- dev/build script that produces `resources/engine/<platform>-<arch>/knowledge-engine`

The sidecar is required in development. `pnpm dev` and `pnpm electron:dev` run the debug-profile knowledge-engine build before starting Vite/Electron. Release packaging still runs the release-profile build.

## Runtime contract

Renderer code does not talk to the sidecar directly.

Electron main owns:

- process lifecycle
- binary resolution
- gRPC request routing
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

Current sidecar gRPC services:

- `DocumentSessionService.Sync`: opens, changes, resyncs, and closes Markdown overlay documents.
- `MarkdownService.GetDocumentSymbols`: returns heading symbols from the opened snapshot.
- `MarkdownService.GetLinks`: returns Markdown and wiki links from the opened snapshot.
- `WorkspaceService`: opens indexes and applies rebuild/upsert/remove operations.
- `SearchService.Search`: returns persisted full-text search results.

The implementation is intentionally small for this phase. The next step from the
technical design is to replace the line-oriented extractor internals with a proper
parser/rope stack, likely `ropey` for document text and either tree-sitter Markdown
or a maintained Markdown parser for richer incremental syntax features. The public
gRPC service shapes should remain stable while the parser internals improve.

## Workspace sidecar gRPC scaffold

The workspace sidecar roadmap has moved to the gRPC/protobuf runtime path. The proto source of truth lives in
`knowledge-engine/proto`, Rust generated bindings are compiled by the `marklab-knowledge-grpc-api`
crate, and Node generation is wired through Buf plus `ts-proto`.

Electron main now routes workspace search and Markdown overlay operations through `WorkspaceSidecarManager`, which owns one gRPC sidecar process per workspace runtime.

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

Electron main now has a `WorkspaceSidecarManager` boundary for workspace runtime routing. The current implementation uses workspace-scoped gRPC sidecar runtimes.

Responsibilities now owned by the manager boundary:

- workspace open/close lifecycle tracking;
- workspace request routing with explicit `workspaceId` attachment;
- active runtime listing for diagnostics;
- a stable boundary for one child process and gRPC channel per workspace.

Each runtime entry now owns its sidecar process handle, environment, session token, readiness state, and transport channel.

### Workspace sidecar spawn plan

Electron main has a sidecar spawn plan helper that merges the current process environment with the per-workspace identity environment. Diagnostic output redacts `GRPC_SESSION_TOKEN`. The plan is used to launch one process per workspace and defines the safe process boundary plus testable environment contract.

The workspace runtime summary now includes this redacted spawn plan, so diagnostics can validate the
future per-workspace process contract without exposing the session token.

### Workspace sidecar identity model

The manager now creates a per-workspace identity plan before opening a runtime. It computes a stable
`workspaceInstanceId`, canonical workspace root, engine data directory, and session token based on
the workspace key and index path. Runtime diagnostics intentionally omit the session token and full
environment payload.

Current transport uses a workspace-scoped gRPC sidecar. Each runtime entry launches an actual child process with these environment variables:
`WORKSPACE_ROOT`, `WORKSPACE_INSTANCE_ID`, `ENGINE_DATA_DIR`, and `GRPC_SESSION_TOKEN`.
