# Node Knowledge Sidecar

Marklab runs workspace knowledge capabilities in an Electron
`utilityProcess`. The implementation is TypeScript/Node.js only; development,
build, packaging, and runtime do not require Rust, Cargo, gRPC, protobuf code
generation, or a platform-specific knowledge-engine executable.

## Runtime boundary

- Electron main owns lifecycle, typed renderer IPC, and one runtime per active
  workspace.
- `electron/sidecar/knowledgeSidecarEntry.ts` is compiled to
  `dist-electron/knowledgeSidecarEntry.js` and forked with
  `utilityProcess.fork` after Electron is ready.
- `NodeSidecarRpcClient` carries structured-clone request/response messages
  across the process boundary. Requests are matched by numeric IDs and all
  pending calls fail if the utility process exits.
- The utility process receives the canonical workspace root and its isolated
  engine-data directory as positional arguments. Workspace file paths are
  resolved through the existing path guard, so absolute paths and parent
  traversal are rejected. Search data is written only below the engine-data
  directory, never into the user's workspace.
- Renderer code continues to use the existing preload and IPC contracts. It
  never talks to the utility process directly.

## Capability ownership

The Node sidecar owns:

- workspace file snapshots, reads, writes, creates, renames, deletes, and path
  metadata
- workspace-scoped Markdown search index rebuild, upsert, remove, prefix
  removal, filtering, ordering, pagination, and diagnostics
- open-document overlays for unsaved Markdown, incremental edits, symbols, and
  links
- workspace mind-map graph and document outline graph construction

Electron main retains workspace watcher coordination, buffer flush ordering,
renderer event publication, and the existing service/API compatibility layer.

## Lifecycle and failure isolation

`WorkspaceSidecarManager` creates a utility process lazily per workspace,
waits for the process `spawn` event, probes capabilities, and then opens the
workspace. Close requests clear the child state and terminate the process. A
process crash changes only that workspace runtime and rejects its outstanding
RPC requests; it does not execute knowledge work on the Electron main thread.

Each workspace search index is persisted as `search.sqlite3` below its isolated
engine-data directory. SQLite FTS5 owns retrieval and ranking while mutations
run in bounded transactions. The database uses WAL mode and can be deleted and
rebuilt from workspace files when its schema or contents are invalid.

## Build and packaging

Vite treats the sidecar as an Electron main entry, so the compiled JavaScript
is included by the existing `dist-electron/**/*` packaging rule. No
`extraResources` engine directory or per-platform executable is required.

## Dependency policy

Runtime dependencies for the sidecar must have an active release history,
documented compatibility and a stable public API. Prefer maintainers that own
the relevant protocol or editor implementation over thin community wrappers.
The current implementation uses SQLite FTS5 for the persistent local search
index, Microsoft's `vscode-markdown-languageservice` for embedded Markdown
language features and the official `@modelcontextprotocol/sdk` for MCP.

Dependency upgrades must keep the lockfile reproducible and pass the sidecar,
MCP, multi-workspace isolation and persistence-recovery suites. Major-version
overrides of transitive packages are not accepted as an audit workaround.
MCP SDK v2 is tracked as a dedicated migration because its split package model
and nominal types require coordinated API changes; v1 and v2 types must not be
mixed in the same runtime boundary.

### Read-only MCP entry

The former Rust `marklab-mcp` binary is replaced by
`electron/mcp/marklabMcpEntry.ts`, compiled as
`dist-electron/marklabMcpEntry.js`. It uses the official Model Context
Protocol SDK over stdio and exposes only two read-only tools:

- `marklab_workspace_status` reads workspace, health, index, and storage status.
- `marklab_search_workspace` reads the same persisted SQLite FTS5 index used by
  the knowledge sidecar. It accepts a required query and a limit from 1 through 50.

The MCP process does not expose workspace mutation or command execution. Pass
the canonical workspace and engine-data paths explicitly:

```text
node dist-electron/marklabMcpEntry.js --workspace-root <workspace> --engine-data-dir <engine-data> --default-search-limit 10
```

Each MCP process is bound to exactly one explicit workspace root and its own
engine-data directory for its lifetime. It never consults Electron's active
workspace, so multi-window clients start one MCP process per workspace/window
and cannot accidentally search another window's index.

The Electron executable can also host the same built entry in Node mode:

```text
ELECTRON_RUN_AS_NODE=1 <electron-executable> dist-electron/marklabMcpEntry.js --workspace-root <workspace> --engine-data-dir <engine-data>
```

`MARKLAB_MCP_WORKSPACE_ROOT`, `MARKLAB_MCP_ENGINE_DATA_DIR`, and
`MARKLAB_MCP_DEFAULT_SEARCH_LIMIT` remain supported for MCP client
configurations that prefer environment variables; explicit CLI arguments take
precedence.

Focused verification:

```text
pnpm test:knowledge:integration
pnpm exec tsc -p tsconfig.electron.json
pnpm exec vite build --mode electron
```
