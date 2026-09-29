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

The search index is held in utility-process memory while active and persisted
as a versioned JSON snapshot below the workspace's engine-data directory.
Rebuild, upsert, remove, and prefix-removal mutations write a same-directory
temporary file, flush it, and then replace the primary snapshot. The previous
valid primary becomes a backup. On restart, the sidecar loads the primary and
falls back to the backup if a write was interrupted or the primary is invalid.

## Build and packaging

Vite treats the sidecar as an Electron main entry, so the compiled JavaScript
is included by the existing `dist-electron/**/*` packaging rule. No
`extraResources` engine directory or per-platform executable is required.

Focused verification:

```text
pnpm test:knowledge:integration
pnpm exec tsc -p tsconfig.electron.json
pnpm exec vite build --mode electron
```
