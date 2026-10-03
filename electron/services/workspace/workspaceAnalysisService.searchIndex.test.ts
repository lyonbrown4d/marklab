import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types.js'
import type { Logger } from '@electron/services/logger.js'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService.js'
import type { WorkspaceDocument } from '@electron/services/workspace/workspaceDocumentLoader.js'
import type { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex.js'
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
