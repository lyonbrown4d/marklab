# Knowledge Engine and Node Boundary

Marklab is migrating durable workspace knowledge features from Electron/Node
services into the Rust `knowledge-engine` sidecar. During the migration,
Electron remains the runtime owner and compatibility boundary for renderer IPC.

## Current ownership

Rust `knowledge-engine` owns:

- persisted full-text workspace search state
- workspace search index open, close, rebuild, upsert, remove, and query commands
- sidecar process memory and index lifecycle behind Electron supervision

Electron main owns:

- sidecar process startup, shutdown, and gRPC routing
- workspace root validation and filesystem access
- document loading, buffer flushing, watcher events, and snapshot events
- typed renderer IPC commands
- compatibility fallbacks while Rust coverage is incomplete

Renderer code must not talk to the sidecar directly. Renderer Markdown and
workspace features should keep using typed service APIs such as
`src/services/markdownLanguageApi.ts` and workspace APIs exposed through preload
IPC.

## Search boundary

The active full-text search bridge is:

1. `electron/container.ts` creates `WorkspaceSearchIndex` with
   `KnowledgeEngineWorkspaceSearchBackend`.
2. `electron/services/workspace/workspaceAnalysisService.ts` loads Markdown
   documents and sends index operations through `WorkspaceSearchIndex`.
3. `electron/services/knowledgeEngine/workspaceSearchBackend.ts` normalizes
   sidecar responses into `FsSearchResult`.

`electron/services/workspace/markdown/search.ts` is still intentionally present.
It is not the persisted search backend. It is the in-process fallback used by
the analysis worker and main-thread fallback path when the sidecar-backed search
task fails. Do not delete it until search fallback policy is explicitly removed
or replaced by a Rust fallback command.

No Electron-side SQLite, Kysely, or native search module should be introduced for
workspace search. New persisted search behavior should go through the Rust
sidecar.

## Markdown language service boundary

The current Markdown language service is still TypeScript-owned:

- `electron/services/markdownLanguage/*` implements completions, diagnostics,
  definitions, references, hover, symbols, code actions, and rename support.
- `electron/ipc/workspaceCommands.ts` exposes named
  `markdown_language_*` commands.
- `src/services/markdownLanguageApi.ts` is the renderer-facing typed adapter.
- The service uses `WorkspaceService.workspaceIndex()` and overlays unsaved
  document content before answering LSP-style requests.

This is active code, not dead code. It should not be removed until equivalent
sidecar commands exist and the renderer API has been bridged command by command.

## Markdown LSP migration plan

Phase 1: keep TypeScript as the compatibility layer.

- Keep the existing `markdown_language_*` IPC names stable.
- Route only search persistence through `WorkspaceSearchIndex`.
- Keep TypeScript fallbacks for diagnostics, workspace graph, and search until
  the sidecar has matching behavior and failure handling.

Phase 2: add Rust read-only language commands behind Electron.

- Add sidecar commands for workspace index, diagnostics, document symbols,
  definition, references, hover, and completions.
- Keep request and response payloads compatible with
  `src/services/markdownLanguageApi.ts`.
- Preserve the unsaved-current-document overlay semantics before dispatching to
  Rust, or add an explicit sidecar request field for the unsaved buffer.

Phase 3: bridge commands incrementally.

- Switch one Electron Markdown language method at a time to Rust.
- Keep the TypeScript implementation as a fallback during each switch.
- Compare behavior for path normalization, anchor slugs, wiki links, local asset
  links, and missing-link diagnostics before deleting TS code.

Phase 4: move write-capable operations last.

- Rename and code actions should migrate after read-only commands.
- Electron must continue to own filesystem writes and buffer updates.
- Rust may compute edits, but Electron should validate target workspace paths
  and apply edits through `WorkspaceService`.

Phase 5: remove TypeScript fallbacks only after parity is explicit.

- Delete old TS modules only when no IPC path, worker path, or fallback path
  imports them.
- Remove dependency entries only after a package-level scan confirms no runtime,
  test, or build usage.
- Keep `src/services/markdownLanguageApi.ts` unless the renderer API itself is
  intentionally renamed.

## Cleanup rules

Safe to remove:

- files with no imports, no dynamic command registration, and no test-only use
- dependencies with no source, test, script, or transitive runtime requirement
- compatibility shims after Electron routes all callers to equivalent Rust
  commands

Not safe to remove yet:

- `electron/services/markdownLanguage/*`
- `electron/services/workspace/markdown/search.ts`
- `electron/services/workspace/workspaceAnalysisWorkerEntry.ts`
- `src/services/markdownLanguageApi.ts`
