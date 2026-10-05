import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types.js'
import type { Logger } from '@electron/services/logger.js'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService.js'
import type { WorkspaceDocument } from '@electron/services/workspace/workspaceDocumentLoader.js'
import {
  WorkspaceSearchIndex,
  type WorkspaceSearchIndexBackend,
} from '@electron/services/workspace/workspaceSearchIndex.js'
import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('WorkspaceAnalysisService search rebuild lifecycle', () => {
  it('does not start a buffer-flush index update after disposal', async () => {
    vi.useFakeTimers()
    const appData = await createTempDirectory('app-data')
    const root = await createWorkspace('dispose', '# Before')
    const index = createSearchIndexFake()
    const service = new WorkspaceAnalysisService(
      createApp(appData),
      createShell(),
      createLogger(),
      createLocalHistoryService(),
      () => index as unknown as WorkspaceSearchIndex,
    )

    try {
      await service.setRoot({ path: root })
      await service.readFile({ path: 'note.md' })
      service.updateBuffer({ path: 'note.md', content: '# After' })
      await service.flushBuffers()

      service.dispose()
      await vi.runAllTimersAsync()

      expect(index.open).not.toHaveBeenCalled()
    } finally {
      service.dispose()
      vi.useRealTimers()
    }
  })

  it('does not let an obsolete workspace rebuild mark the new workspace index ready', async () => {
    const appData = await createTempDirectory('app-data')
    const firstRoot = await createWorkspace('first', '# First\nold workspace')
    const secondRoot = await createWorkspace('second', '# Second\nnew workspace')
    let releaseFirstRead!: () => void
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve
    })
    let markFirstRead!: () => void
    const firstRead = new Promise<void>((resolve) => {
      markFirstRead = resolve
    })
    const index = createSearchIndexFake()
    const service = new ControlledWorkspaceAnalysisService(
      createApp(appData),
      createShell(),
      createLogger(),
      () => index as unknown as WorkspaceSearchIndex,
      firstReadGate,
      markFirstRead,
    )

    try {
      await service.setRoot({ path: firstRoot })
      const staleBuild = service.rebuildSearchIndex()
      await firstRead
      expect(index.rebuild).not.toHaveBeenCalled()

      await service.setRoot({ path: secondRoot })
      releaseFirstRead()
      await staleBuild
      expect(index.rebuild).not.toHaveBeenCalled()

      await service.searchWorkspace({ query: 'new' })

      expect(index.rebuild).toHaveBeenCalledTimes(1)
      expect(index.rebuild.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ path: 'note.md', content: '# Second\nnew workspace' }),
      ])
    } finally {
      service.dispose()
    }
  })

  it('waits for the previous root index to close before the first search opens the new root', async () => {
    const appData = await createTempDirectory('app-data')
    const firstRoot = await createWorkspace('first', '# First\nold workspace')
    const secondRoot = await createWorkspace(
      'second',
      '# Topic 07\nTopic 07 contains new workspace',
    )
    const backend = new RootSwitchSearchBackend()
    const index = new WorkspaceSearchIndex(backend)
    const service = new WorkspaceAnalysisService(
      createApp(appData),
      createShell(),
      createLogger(),
      createLocalHistoryService(),
      () => index,
    )

    try {
      await service.setRoot({ path: firstRoot })
      await service.searchWorkspace({ query: 'old workspace' })
      backend.delayNextClose()

      await service.setRoot({ path: secondRoot })
      await backend.closeStarted
      const firstSearch = service.searchWorkspace({ query: 'Topic 07 contains' })
      const secondSearch = service.searchWorkspace({ query: 'Topic 07 contains' })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      expect(backend.openCalls).toHaveLength(1)
      backend.releaseClose()
      await expect(Promise.all([firstSearch, secondSearch])).resolves.toEqual([
        [expect.objectContaining({ path: 'note.md' })],
        [expect.objectContaining({ path: 'note.md' })],
      ])
      expect(backend.openCalls).toHaveLength(2)
      expect(backend.openCalls[1]).not.toBe(backend.openCalls[0])
    } finally {
      backend.releaseClose()
      service.dispose()
    }
  })
})

class ControlledWorkspaceAnalysisService extends WorkspaceAnalysisService {
  private shouldPauseFirstRead = true

  constructor(
    app: App,
    shell: Shell,
    logger: Logger,
    factory: () => WorkspaceSearchIndex,
    private readonly firstReadGate: Promise<void>,
    private readonly markFirstRead: () => void,
  ) {
    super(app, shell, logger, createLocalHistoryService(), factory)
  }

  protected override async workspaceDocuments(
    replacePath?: string,
    replaceContent?: string,
  ): Promise<WorkspaceDocument[]> {
    const documents = await super.workspaceDocuments(replacePath, replaceContent)
    if (!this.shouldPauseFirstRead) return documents
    this.shouldPauseFirstRead = false
    this.markFirstRead()
    await this.firstReadGate
    return documents
  }
}

const createSearchIndexFake = () => ({
  applySearchChanges: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  hasDocuments: vi.fn(async () => false),
  open: vi.fn(async () => undefined),
  rebuild: vi.fn(async (documents: WorkspaceSearchDocument[]) => void documents),
  search: vi.fn(async () => []),
})

class RootSwitchSearchBackend implements WorkspaceSearchIndexBackend {
  readonly openCalls: string[] = []
  private readonly documents = new Map<string, WorkspaceSearchDocument[]>()
  private shouldDelayClose = false
  private markCloseStarted!: () => void
  private release!: () => void
  closeStarted: Promise<void> = Promise.resolve()
  private closeGate: Promise<void> = Promise.resolve()

  delayNextClose(): void {
    this.shouldDelayClose = true
    this.closeStarted = new Promise<void>((resolve) => {
      this.markCloseStarted = resolve
    })
    this.closeGate = new Promise<void>((resolve) => {
      this.release = resolve
    })
  }

  releaseClose(): void {
    this.release?.()
  }

  async open(workspaceId: string): Promise<void> {
    this.openCalls.push(workspaceId)
    if (!this.documents.has(workspaceId)) this.documents.set(workspaceId, [])
  }

  async close(): Promise<void> {
    if (!this.shouldDelayClose) return
    this.shouldDelayClose = false
    this.markCloseStarted()
    await this.closeGate
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    return Boolean(this.documents.get(workspaceId)?.length)
  }

  async rebuild(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    this.documents.set(workspaceId, documents)
  }

  async applySearchChanges(): Promise<void> {}
  async upsertDocument(): Promise<void> {}
  async removeDocument(): Promise<void> {}
  async removePathPrefix(): Promise<void> {}

  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    return (this.documents.get(workspaceId) ?? [])
      .filter((document) => document.content.includes(query))
      .slice(0, limit)
      .map((document) => ({
        path: document.path,
        title: document.title,
        line: 1,
        column: 1,
        end_column: 1,
        snippet: document.content,
        snippet_highlights: [],
        score: 1,
      }))
  }
}

const createLocalHistoryService = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' as const })),
  }) as unknown as LocalHistoryServiceContract

const createWorkspace = async (name: string, content: string) => {
  const root = await createTempDirectory(name)
  await fs.writeFile(path.join(root, 'note.md'), content)
  return root
}

const createTempDirectory = async (name: string) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `marklab-search-${name}-`))
  tempRoots.push(root)
  return root
}

const createApp = (userDataPath: string): App =>
  ({
    getPath: vi.fn(() => userDataPath),
    on: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as App

const createShell = (): Shell => ({ openPath: vi.fn(async () => '') }) as unknown as Shell

const createLogger = (): Logger => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return logger as unknown as Logger
}
