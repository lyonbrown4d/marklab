import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { vi } from 'vitest'

import {
  WorkspaceSidecarManager,
  type WorkspaceSidecarClient,
} from '@electron/services/knowledgeEngine/workspaceSidecarManager.js'
import type { Logger } from '@electron/services/logger.js'

type CreateManagerOptions = {
  resolveBinary?: ConstructorParameters<typeof WorkspaceSidecarManager>[0]['resolveBinary']
}

export const createManager = (options: CreateManagerOptions = {}) => {
  const child = createChild()
  const client = createClient()
  const startSidecar = vi.fn(async () => ({
    address: '127.0.0.1:40101',
    child,
    client,
  }))
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger

  return {
    child,
    client,
    manager: new WorkspaceSidecarManager({
      appDataDir: 'app-data',
      logger,
      resolveBinary:
        options.resolveBinary ??
        (() => ({
          binaryPath: 'engine.exe',
          exists: true,
          source: 'dev-resource',
        })),
      startSidecar,
    }),
    startSidecar,
  }
}

const createClient = (): WorkspaceSidecarClient => ({
  changeMarkdownDocument: vi.fn(async () => ({
    acknowledged: { documentId: 'alpha.md', version: '2' },
  })),
  close: vi.fn(),
  closeMarkdownDocument: vi.fn(async () => ({
    acknowledged: { documentId: 'alpha.md', version: '0' },
  })),
  closeWorkspace: vi.fn(async () => undefined),
  createWorkspaceDirectory: vi.fn(async () => ({ changed: true, kind: 'folder' as const })),
  createWorkspaceFile: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
  deleteWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
  getCapabilities: vi.fn(async () => ({})),
  getWorkspaceFileSnapshot: vi.fn(async () => ({
    entries: [{ kind: 'file' as const, name: 'alpha.md', path: 'alpha.md' }],
    root: { kind: 'external' as const, path: 'index-a' },
  })),
  getWorkspacePathMetadata: vi.fn(async () => ({
    absolute_path: 'index-a/alpha.md',
    kind: 'file' as const,
    modified_ms: 100,
    path: 'alpha.md',
    readonly: false,
    size_bytes: 7,
  })),
  getWorkspaceStatus: vi.fn(async () => ({
    health: {
      metadataDocuments: '0',
      ok: true,
      pendingOutboxEvents: '0',
      searchableDocuments: '0',
      state: 'ready',
      warnings: [],
    },
    index: {
      metadataDocuments: '0',
      pendingOutboxEvents: '0',
      ready: true,
      searchIndex: 'tantivy',
      searchableDocuments: '0',
    },
    storage: {
      blobBytes: '0',
      blobStore: false,
      metadataBytes: '0',
      metadataDocuments: '0',
      metadataStore: 'redb',
      pendingOutboxEvents: '0',
      searchIndex: 'tantivy',
      searchIndexBytes: '0',
      totalBytes: '0',
    },
  })),
  getMarkdownDocumentSymbols: vi.fn(async () => []),
  getMarkdownLinks: vi.fn(async () => []),
  hasDocuments: vi.fn(async () => false),
  listWorkspaceEntries: vi.fn(async () => [
    { kind: 'file' as const, name: 'alpha.md', path: 'alpha.md' },
  ]),
  openMarkdownDocument: vi.fn(async () => ({
    acknowledged: { documentId: 'alpha.md', version: '1' },
  })),
  openWorkspace: vi.fn(async () => undefined),
  rebuildIndex: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  removePathPrefix: vi.fn(async () => undefined),
  resyncMarkdownDocument: vi.fn(async () => ({
    acknowledged: { documentId: 'alpha.md', version: '2' },
  })),
  readWorkspaceFile: vi.fn(async () => '# Alpha'),
  renameWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
  search: vi.fn(async () => []),
  searchWithOptions: vi.fn(async () => ({
    results: [
      {
        column: 1,
        end_column: 7,
        line: 3,
        path: 'alpha.md',
        score: 0.75,
        snippet: 'Alpha body',
        snippet_highlights: [{ end: 5, start: 0 }],
        title: 'Alpha',
      },
    ],
    totalHits: 1,
  })),
  shutdown: vi.fn(async () => undefined),
  upsertDocument: vi.fn(async () => undefined),
})

const createChild = (): ChildProcessWithoutNullStreams => {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  const child = new EventEmitter() as ChildProcessWithoutNullStreams

  Object.assign(child, {
    kill: vi.fn(() => {
      Object.assign(child, { killed: true })
      child.emit('exit', null, 'SIGTERM')
      return true
    }),
    killed: false,
    pid: 1234,
    stderr,
    stdin,
    stdout,
  })

  return child
}
