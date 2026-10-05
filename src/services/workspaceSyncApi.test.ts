import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getElectronRuntime } from '@/runtime/electron'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'

vi.mock('@/runtime/electron', () => ({ getElectronRuntime: vi.fn() }))

describe('workspaceSyncApi start outcomes', () => {
  const start = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getElectronRuntime).mockReturnValue({ workspaceSync: { start } } as never)
  })

  it('unwraps a completed sync result', async () => {
    const result = {
      changedPaths: [],
      conflicts: [],
      skipped: [],
      uploaded: 1,
      downloaded: 0,
      deleted: 0,
      retries: 0,
    }
    start.mockResolvedValueOnce({ status: 'completed', result })

    await expect(workspaceSyncApi.start('request-1')).resolves.toBe(result)
  })

  it('recreates an AbortError for a cancelled sync', async () => {
    start.mockResolvedValueOnce({ status: 'cancelled' })

    await expect(workspaceSyncApi.start('request-2')).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('recreates a coded error for a busy workspace', async () => {
    start.mockResolvedValueOnce({ status: 'busy' })

    await expect(workspaceSyncApi.start('request-3')).rejects.toMatchObject({
      code: 'workspace_sync_busy',
    })
  })

  it('throws the failed outcome message', async () => {
    start.mockResolvedValueOnce({ status: 'failed', message: 'remote unavailable' })

    await expect(workspaceSyncApi.start('request-4')).rejects.toThrow('remote unavailable')
  })
})
