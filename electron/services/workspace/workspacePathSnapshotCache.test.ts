import { describe, expect, it, vi } from 'vitest'
import { noopLogger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'
import {
  createWorkspacePathSnapshotCache,
  WorkspacePathSnapshotCache,
} from '@electron/services/workspace/workspacePathSnapshotCache'

const state: FsStateData = {
  rootKind: 'single',
  rootPath: '/note.md',
  internalRoot: '/default',
  singleFile: '/note.md',
}
const snapshot = { entries: [], knownPaths: { paths: [], assetPaths: [] } }

describe('workspace path snapshot cache', () => {
  it('uses its default loader and coalesces repeated requests', async () => {
    const cache = createWorkspacePathSnapshotCache(() => state, noopLogger)
    const first = cache.get()
    expect(cache.get()).toBe(first)
    expect((await first).entries).toEqual([{ kind: 'file', name: 'note.md', path: 'note.md' }])
  })

  it('retries failures but does not evict a newer request when an old request fails', async () => {
    let reject!: (error: Error) => void
    const load = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<never>((_, fail) => {
          reject = fail
        }),
      )
      .mockResolvedValue(snapshot)
    const cache = new WorkspacePathSnapshotCache({
      getState: () => state,
      load,
      logger: noopLogger,
      now: () => 10,
    })
    const old = cache.get()
    const failure = expect(old).rejects.toThrow('old failed')
    cache.invalidate()
    const current = cache.get()
    reject(new Error('old failed'))
    await failure
    expect(cache.get()).toBe(current)
    await current
    load.mockRejectedValueOnce(new Error('fresh failed'))
    cache.invalidate()
    await expect(cache.get()).rejects.toThrow('fresh failed')
    await cache.get()
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('retries an invalidated successful request using the latest state', async () => {
    let finish!: (value: typeof snapshot) => void
    let current = state
    const load = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<typeof snapshot>((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValue(snapshot)
    const logger = { ...noopLogger, debug: undefined } as unknown as typeof noopLogger
    const cache = new WorkspacePathSnapshotCache({ getState: () => current, load, logger })
    const old = cache.get()
    current = { ...state, rootPath: '/next.md', singleFile: '/next.md' }
    cache.invalidate()
    finish(snapshot)
    await old
    expect(load.mock.calls.map(([loaded]) => loaded.rootPath)).toEqual(['/note.md', '/next.md'])
    await cache.get()
  })
})
