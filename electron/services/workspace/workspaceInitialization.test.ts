import { beforeEach, describe, expect, it, vi } from 'vitest'
import { noopLogger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'
import { WorkspaceInitialization } from '@electron/services/workspace/workspaceInitialization'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), list: vi.fn() }))
vi.mock('@electron/services/workspace/workspaceDefaultRoot', () => ({
  ensureDefaultFile: mocks.prepare,
}))
vi.mock('@electron/services/workspace/workspaceUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@electron/services/workspace/workspaceUtils')>()),
  listWorkspacePathSnapshot: mocks.list,
}))
const fixture = () => {
  const initial: FsStateData = {
    rootKind: 'internal',
    rootPath: '/default',
    internalRoot: '/default',
    singleFile: null,
  }
  let state = initial
  let disposed = false
  const ready = vi.fn()
  const initialization = new WorkspaceInitialization(
    initial,
    () => state,
    () => disposed,
    ready,
    noopLogger,
  )
  return {
    initial,
    initialization,
    ready,
    switchRoot: (next: FsStateData) => {
      state = next
    },
    dispose: () => {
      disposed = true
    },
  }
}
const external = (initial: FsStateData): FsStateData => ({
  ...initial,
  rootKind: 'external',
  rootPath: '/external',
})
beforeEach(() => {
  mocks.prepare.mockReset().mockResolvedValue(undefined)
  mocks.list
    .mockReset()
    .mockResolvedValue({ entries: [], knownPaths: { paths: [], assetPaths: [] } })
})

describe('lazy workspace initialization', () => {
  it('does no constructor work and shares one preparation across readers', async () => {
    const f = fixture()
    expect(mocks.prepare).not.toHaveBeenCalled()
    await Promise.all([
      f.initialization.ensureReady(),
      f.initialization.ensureReady(),
      f.initialization.pathSnapshots.get(),
    ])
    await f.initialization.ensureReady()
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(f.ready).toHaveBeenCalledTimes(1)
    expect(mocks.list).toHaveBeenCalledWith(f.initial)
  })

  it('retries initialization after failure', async () => {
    const f = fixture()
    mocks.prepare.mockRejectedValueOnce(new Error('permission denied'))
    await expect(f.initialization.ensureReady()).rejects.toThrow('permission denied')
    await f.initialization.ensureReady()
    expect(mocks.prepare).toHaveBeenCalledTimes(2)
    expect(f.ready).toHaveBeenCalledTimes(1)
  })

  it('rejects a disposed service before starting and after an in-flight preparation', async () => {
    const f = fixture()
    let finish!: () => void
    mocks.prepare.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const request = f.initialization.ensureReady()
    f.dispose()
    await expect(f.initialization.ensureReady()).rejects.toThrow('disposed')
    finish()
    await expect(request).rejects.toThrow('disposed')
    await expect(f.initialization.loadSnapshot(f.initial)).rejects.toThrow('disposed')
    expect(f.ready).not.toHaveBeenCalled()
  })

  it('does not publish a snapshot after disposal during preparation', async () => {
    const f = fixture()
    let finish!: () => void
    mocks.prepare.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const request = f.initialization.loadSnapshot(f.initial)
    f.dispose()
    finish()
    await expect(request).rejects.toThrow('disposed')
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('external and single-file requests bypass a pending default scan', async () => {
    const f = fixture()
    let finish!: () => void
    mocks.prepare.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const request = f.initialization.ensureReady()
    const rejected = expect(request).rejects.toThrow('Workspace changed')
    const next = external(f.initial)
    f.switchRoot(next)
    await f.initialization.ensureReady()
    await f.initialization.loadSnapshot(next)
    f.switchRoot({ ...next, rootKind: 'single', rootPath: '/note.md', singleFile: '/note.md' })
    await f.initialization.ensureReady()
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    finish()
    await rejected
    expect(f.ready).not.toHaveBeenCalled()
  })

  it('redirects a stale snapshot to the current root through cache invalidation', async () => {
    const f = fixture()
    let finish!: () => void
    mocks.prepare.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const request = f.initialization.pathSnapshots.get()
    const next = external(f.initial)
    f.switchRoot(next)
    f.initialization.pathSnapshots.invalidate()
    finish()
    await request
    expect(mocks.list.mock.calls.map(([state]) => state)).toEqual([f.initial, next])
    expect(f.ready).not.toHaveBeenCalled()
  })
})
