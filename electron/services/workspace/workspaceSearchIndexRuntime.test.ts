import { describe, expect, it, vi } from 'vitest'

import type { Logger } from '@electron/services/logger'
import { WorkspaceSearchIndexRuntime } from '@electron/services/workspace/workspaceSearchIndexRuntime'

describe('WorkspaceSearchIndexRuntime', () => {
  it('observes and logs an index close failure during disposal', async () => {
    const error = new Error('close failed')
    const logger = createLogger()
    const runtime = new WorkspaceSearchIndexRuntime({
      getState: () => ({ rootKind: 'internal', rootPath: 'workspace' }) as never,
      getUserDataPath: () => 'data',
      index: {
        close: vi.fn(async () => Promise.reject(error)),
      } as never,
      loadDocuments: vi.fn(async () => []),
      logger,
      readFile: vi.fn(async () => ''),
      runTask: (work) => work(),
    })

    runtime.dispose()
    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith('search index close failed during disposal', {
        error,
      }),
    )
  })
})

const createLogger = (): Logger => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return logger as unknown as Logger
}
