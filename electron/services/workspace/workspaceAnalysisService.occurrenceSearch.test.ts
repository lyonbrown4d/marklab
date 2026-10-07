import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService'
import type { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('WorkspaceAnalysisService occurrence search', () => {
  it('aborts the active backend request through explicit cancellation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-occurrence-search-'))
    tempRoots.push(root)
    const index = createSearchIndexFake()
    const service = new WorkspaceAnalysisService(
      createApp(root),
      createShell(),
      createLogger(),
      createHistory(),
      () => index as unknown as WorkspaceSearchIndex,
    )
    await service.setRoot({ path: root })

    const search = service.searchWorkspaceOccurrences({
      requestId: 'request-1',
      query: 'needle',
      options: { caseSensitive: false, wholeWord: false, useRegex: true },
    })
    await vi.waitFor(() => expect(index.searchOccurrences).toHaveBeenCalledOnce())

    await expect(
      service.cancelWorkspaceOccurrenceSearch({ requestId: 'request-1' }),
    ).resolves.toEqual({
      cancelled: true,
      requestId: 'request-1',
    })
    await expect(search).rejects.toMatchObject({ name: 'AbortError' })
    service.dispose()
  })
})

const createSearchIndexFake = () => ({
  applySearchChanges: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  hasDocuments: vi.fn(async () => true),
  open: vi.fn(async () => undefined),
  rebuild: vi.fn(async () => undefined),
  searchOccurrences: vi.fn(
    (_request, signal?: AbortSignal) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('cancelled')
          error.name = 'AbortError'
          reject(error)
        })
        void resolve
      }),
  ),
})

const createApp = (userDataPath: string): App =>
  ({
    getPath: vi.fn(() => userDataPath),
    on: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as App

const createShell = (): Shell => ({ openPath: vi.fn(async () => '') }) as unknown as Shell

const createLogger = (): Logger => {
  const logger = { child: vi.fn(() => logger), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  return logger as unknown as Logger
}

const createHistory = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' })),
  }) as unknown as LocalHistoryServiceContract
