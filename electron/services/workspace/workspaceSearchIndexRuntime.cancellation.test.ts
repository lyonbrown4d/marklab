import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Logger } from '@electron/services/logger'
import type { FsSearchResult, FsStateData } from '@electron/services/workspace/types'
import { WorkspaceDocumentCatalog } from '@electron/services/workspace/workspaceDocumentCatalog'
import {
  WorkspaceSearchIndex,
  type WorkspaceSearchIndexBackend,
} from '@electron/services/workspace/workspaceSearchIndex'
import { WorkspaceSearchIndexRuntime } from '@electron/services/workspace/workspaceSearchIndexRuntime'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'

const tempRoots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('WorkspaceSearchIndexRuntime cancellation', () => {
  it('rebuilds the new workspace without waiting for an aborted catalog scan', async () => {
    vi.useFakeTimers()
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-search-cancel-'))
    tempRoots.push(userDataPath)
    const firstRoot = path.join(userDataPath, 'workspace-a')
    const secondRoot = path.join(userDataPath, 'workspace-b')
    const state: FsStateData = {
      internalRoot: firstRoot,
      rootKind: 'external',
      rootPath: firstRoot,
      singleFile: null,
    }
    let releaseFirstRead!: () => void
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve
    })
    let markFirstRead!: () => void
    const firstReadStarted = new Promise<void>((resolve) => {
      markFirstRead = resolve
    })
    const catalog = new WorkspaceDocumentCatalog(
      async () => ({
        entries: [{ kind: 'file', name: 'note.md', path: 'note.md' }],
        knownPaths: { assetPaths: [], paths: ['note.md'] },
      }),
      async () => {
        const rootAtRead = state.rootPath
        if (rootAtRead === firstRoot) {
          markFirstRead()
          await firstReadGate
        }
        return rootAtRead === firstRoot ? '# Old workspace' : '# New workspace'
      },
    )
    const backend = new RecordingSearchBackend()
    const runtime = new WorkspaceSearchIndexRuntime({
      getState: () => state,
      getUserDataPath: () => userDataPath,
      index: new WorkspaceSearchIndex(backend),
      loadDocuments: (signal) => catalog.documents(undefined, undefined, signal),
      logger: createLogger(),
      readFile: async () => '',
      runTask: (work) => work(),
    })

    runtime.onWorkspacePathChanged(null)
    await vi.advanceTimersByTimeAsync(600)
    await firstReadStarted

    state.rootPath = secondRoot
    runtime.reset()
    runtime.onWorkspacePathChanged(null)
    await vi.advanceTimersByTimeAsync(600)

    await vi.waitFor(() =>
      expect(backend.rebuilds).toContainEqual([
        expect.objectContaining({ path: 'note.md', content: '# New workspace' }),
      ]),
    )
    expect(backend.rebuilds).toHaveLength(1)

    releaseFirstRead()
    runtime.dispose()
  })
})

class RecordingSearchBackend implements WorkspaceSearchIndexBackend {
  readonly rebuilds: WorkspaceSearchDocument[][] = []

  async open(): Promise<void> {}
  async close(): Promise<void> {}
  async hasDocuments(): Promise<boolean> {
    return false
  }
  async rebuild(_workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    this.rebuilds.push(documents)
  }
  async applySearchChanges(): Promise<void> {}
  async upsertDocument(): Promise<void> {}
  async removeDocument(): Promise<void> {}
  async removePathPrefix(): Promise<void> {}
  async search(): Promise<FsSearchResult[]> {
    return []
  }
}

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
