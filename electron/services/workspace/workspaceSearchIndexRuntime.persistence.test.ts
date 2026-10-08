import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Logger } from '@electron/services/logger'
import { NodeSearchDocumentRepository } from '@electron/services/knowledgeEngine/nodeSearchDocumentRepository'
import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'
import {
  WorkspaceSearchIndex,
  type WorkspaceSearchIndexBackend,
} from '@electron/services/workspace/workspaceSearchIndex'
import { WorkspaceSearchIndexRuntime } from '@electron/services/workspace/workspaceSearchIndexRuntime'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'

const tempRoots: string[] = []
const backends: PersistentSearchBackend[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(backends.splice(0).map((backend) => backend.close()))
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('WorkspaceSearchIndexRuntime persistence', () => {
  it('rebuilds a persisted index after an incremental update fails and the runtime restarts', async () => {
    vi.useFakeTimers()
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-search-runtime-'))
    tempRoots.push(userDataPath)
    const state = {
      rootKind: 'internal',
      rootPath: 'workspace',
    } as const
    let documents: WorkspaceSearchDocument[] = [
      { path: 'note.md', title: 'Note', content: 'baseline content' },
    ]
    const firstBackend = new PersistentSearchBackend()
    const firstRuntime = createRuntime({
      backend: firstBackend,
      documents: () => documents,
      state,
      userDataPath,
    })

    await firstRuntime.search({ query: 'baseline' })
    expect(firstBackend.rebuildCalls).toBe(1)

    vi.spyOn(NodeSearchDocumentRepository.prototype, 'upsertMany').mockRejectedValueOnce(
      new Error('disk full'),
    )
    documents = [{ path: 'note.md', title: 'Note', content: 'updated content' }]
    firstRuntime.onWorkspacePathChanged('note.md', 'change')
    await vi.advanceTimersByTimeAsync(600)
    firstRuntime.dispose()
    await firstBackend.closed

    const restartedBackend = new PersistentSearchBackend()
    const restartedRuntime = createRuntime({
      backend: restartedBackend,
      documents: () => documents,
      state,
      userDataPath,
    })

    await expect(restartedRuntime.search({ query: 'updated' })).resolves.toMatchObject([
      { path: 'note.md' },
    ])
    expect(restartedBackend.rebuildCalls).toBe(1)

    restartedRuntime.dispose()
    await restartedBackend.closed
  })
})

type RuntimeFixtureOptions = {
  backend: WorkspaceSearchIndexBackend
  documents: () => WorkspaceSearchDocument[]
  state: { rootKind: 'internal'; rootPath: string }
  userDataPath: string
}

const createRuntime = ({
  backend,
  documents,
  state,
  userDataPath,
}: RuntimeFixtureOptions): WorkspaceSearchIndexRuntime =>
  new WorkspaceSearchIndexRuntime({
    getState: () => state as never,
    getUserDataPath: () => userDataPath,
    index: new WorkspaceSearchIndex(backend),
    loadDocuments: async () => documents(),
    logger: createLogger(),
    readFile: async (documentPath) =>
      documents().find((document) => document.path === documentPath)?.content ?? '',
    runTask: (work) => work(),
  })

const createLogger = (): Logger => {
  const logger = {
    child: vi.fn(() => logger),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return logger as unknown as Logger
}

class PersistentSearchBackend implements WorkspaceSearchIndexBackend {
  private index: NodeSearchIndex | null = null
  private resolveClosed!: () => void
  readonly closed = new Promise<void>((resolve) => {
    this.resolveClosed = resolve
  })
  rebuildCalls = 0

  constructor() {
    backends.push(this)
  }

  async open(workspaceId: string, indexPath: string): Promise<void> {
    this.index = new NodeSearchIndex(indexPath, workspaceId)
    await this.index.getSize()
  }

  async close(): Promise<void> {
    const index = this.index
    if (!index) return
    this.index = null
    await index.close()
    this.resolveClosed()
  }

  hasDocuments(): Promise<boolean> {
    return this.requireIndex().hasDocuments()
  }

  async rebuild(_workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    this.rebuildCalls += 1
    await this.requireIndex().rebuild(documents)
  }

  applySearchChanges(
    _workspaceId: string,
    batch: Parameters<NodeSearchIndex['applyBatch']>[0],
  ): Promise<void> {
    return this.requireIndex().applyBatch(batch)
  }

  upsertDocument(_workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    return this.requireIndex().upsert(document)
  }

  removeDocument(_workspaceId: string, documentPath: string): Promise<void> {
    return this.requireIndex().remove(documentPath)
  }

  removePathPrefix(_workspaceId: string, prefix: string): Promise<void> {
    return this.requireIndex().removePrefix(prefix)
  }

  async search(_workspaceId: string, query: string, limit: number) {
    return (await this.requireIndex().search(query, { limit })).results
  }

  private requireIndex(): NodeSearchIndex {
    if (!this.index) throw new Error('Search index is not open')
    return this.index
  }
}
