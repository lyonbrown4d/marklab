import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceWatcher } from '@electron/services/workspace/workspaceWatcher'
import { noopLogger } from '@electron/services/logger'
import type { FsStateData } from '@electron/services/workspace/types'

const watcherMock = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('@parcel/watcher', () => ({
  default: {
    subscribe: watcherMock.subscribe,
  },
}))

const tempRoots: string[] = []

const createWorkspaceState = (rootPath: string): FsStateData => ({
  rootKind: 'external',
  rootPath,
  internalRoot: rootPath,
  singleFile: null,
})

const createTempRoot = async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-watch-'))
  tempRoots.push(root)
  return root
}

const nativeBackends: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'fs-events',
  linux: 'inotify',
  win32: 'windows',
}
const nativeBackend = nativeBackends[process.platform]

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('WorkspaceWatcher', () => {
  beforeEach(() => {
    watcherMock.subscribe.mockReset()
    watcherMock.unsubscribe.mockReset()
    watcherMock.unsubscribe.mockResolvedValue(undefined)
    watcherMock.subscribe.mockResolvedValue({ unsubscribe: watcherMock.unsubscribe })
  })

  it('uses the native recursive watcher backend for workspace changes', async () => {
    const root = await createTempRoot()
    const changed: Array<{ eventName: string | undefined; path: string | null }> = []
    const statuses: Array<{ message: string | null; status: string }> = []
    const workspaceWatcher = new WorkspaceWatcher({
      getState: () => createWorkspaceState(root),
      onChanged: (changedPath, eventName) => changed.push({ path: changedPath, eventName }),
      setStatus: (status, message) => statuses.push({ status, message }),
    })

    workspaceWatcher.restart()

    await vi.waitFor(() =>
      expect(watcherMock.subscribe).toHaveBeenCalledWith(root, expect.any(Function), {
        backend: nativeBackend,
      }),
    )

    const callback = watcherMock.subscribe.mock.calls[0]?.[1]
    callback(null, [{ path: path.join(root, 'notes.md'), type: 'update' }])

    await vi.waitFor(() =>
      expect(changed).toEqual([{ path: path.join(root, 'notes.md'), eventName: 'change' }]),
    )
    await vi.waitFor(() =>
      expect(statuses).toContainEqual({ status: 'running', message: 'Watcher active' }),
    )

    workspaceWatcher.dispose()

    await vi.waitFor(() => expect(watcherMock.unsubscribe).toHaveBeenCalled())
  })

  it('filters hidden and temporary file events from the native watcher', async () => {
    const root = await createTempRoot()
    const changed: Array<{ eventName: string | undefined; path: string | null }> = []
    const workspaceWatcher = new WorkspaceWatcher({
      getState: () => createWorkspaceState(root),
      onChanged: (changedPath, eventName) => changed.push({ path: changedPath, eventName }),
      setStatus: vi.fn(),
    })

    workspaceWatcher.restart()

    await vi.waitFor(() => expect(watcherMock.subscribe).toHaveBeenCalled())

    const callback = watcherMock.subscribe.mock.calls[0]?.[1]
    callback(null, [
      { path: path.join(root, '.git', 'index'), type: 'update' },
      { path: path.join(root, 'notes.md.tmp'), type: 'update' },
      { path: path.join(root, 'notes.md'), type: 'update' },
    ])

    await vi.waitFor(() =>
      expect(changed).toEqual([{ path: path.join(root, 'notes.md'), eventName: 'change' }]),
    )

    workspaceWatcher.dispose()
  })
})

describe('WorkspaceWatcher lifecycle and filtering', () => {
  beforeEach(() => {
    watcherMock.subscribe.mockReset().mockResolvedValue({ unsubscribe: watcherMock.unsubscribe })
    watcherMock.unsubscribe.mockReset().mockResolvedValue(undefined)
  })

  it('uses the containing directory for single-file workspaces', async () => {
    const root = await createTempRoot()
    const file = path.join(root, 'note.md')
    const workspaceWatcher = new WorkspaceWatcher({
      getState: () => ({ ...createWorkspaceState(file), rootKind: 'single', singleFile: file }),
      onChanged: vi.fn(),
      setStatus: vi.fn(),
    })
    workspaceWatcher.restart()
    await vi.waitFor(() =>
      expect(watcherMock.subscribe).toHaveBeenCalledWith(root, expect.any(Function), {
        backend: nativeBackend,
      }),
    )
    workspaceWatcher.dispose()
  })

  it.each(['', 'missing', 'file'])('stays idle when root is %s', async (kind) => {
    const root = await createTempRoot()
    const target = kind === '' ? '' : path.join(root, kind)
    if (kind === 'file') await fs.writeFile(target, '')
    const status = vi.fn()
    const workspaceWatcher = new WorkspaceWatcher({
      getState: () => createWorkspaceState(target),
      onChanged: vi.fn(),
      setStatus: status,
    })
    workspaceWatcher.restart()
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith('idle', 'No active watcher'))
    expect(watcherMock.subscribe).not.toHaveBeenCalled()
    workspaceWatcher.dispose()
    workspaceWatcher.restart()
    expect(watcherMock.subscribe).not.toHaveBeenCalled()
  })

  it('reports native subscribe and callback failures', async () => {
    const root = await createTempRoot()
    const status = vi.fn()
    const workspaceWatcher = new WorkspaceWatcher({
      getState: () => createWorkspaceState(root),
      onChanged: vi.fn(),
      setStatus: status,
    })
    watcherMock.subscribe.mockRejectedValueOnce(new Error('subscribe failed'))
    workspaceWatcher.restart()
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith('error', 'subscribe failed'))
    workspaceWatcher.restart()
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith('running', 'Watcher active'))
    const callback = watcherMock.subscribe.mock.calls[1][1]
    callback(new Error('callback failed'), [])
    expect(status).toHaveBeenCalledWith('error', 'callback failed')
    workspaceWatcher.dispose()
  })

  it('filters outside paths and own writes at event receipt, then expires suppression', async () => {
    const root = await createTempRoot()
    const changed = vi.fn()
    const workspaceWatcher = new WorkspaceWatcher({
      getState: () => createWorkspaceState(root),
      onChanged: changed,
      setStatus: vi.fn(),
    })
    workspaceWatcher.restart()
    await vi.waitFor(() => expect(watcherMock.subscribe).toHaveBeenCalled())
    const callback = watcherMock.subscribe.mock.calls[0][1]
    const file = path.join(root, 'own.md')
    const now = vi.spyOn(Date, 'now').mockReturnValue(100)
    workspaceWatcher.markOwnWrite(file)
    callback(null, [
      { path: file, type: 'update' },
      { path: '', type: 'update' },
      { path: path.join(root, '..', 'outside.md'), type: 'update' },
    ])
    await Promise.resolve()
    expect(changed).not.toHaveBeenCalled()
    now.mockReturnValue(1700)
    callback(null, [
      { path: file, type: 'update' },
      { path: '', type: 'update' },
      { path: root, type: 'update' },
    ])
    await vi.waitFor(() =>
      expect(changed.mock.calls).toEqual([
        [file, 'change'],
        [null, 'change'],
        [root, 'change'],
      ]),
    )
    now.mockRestore()
    workspaceWatcher.dispose()
  })

  it('logs an unsubscribe failure when restarting an active subscription', async () => {
    const root = await createTempRoot()
    const warn = vi.fn()
    const logger = { ...noopLogger, info: vi.fn(), warn, error: vi.fn() }
    const workspaceWatcher = new WorkspaceWatcher({
      getState: () => createWorkspaceState(root),
      onChanged: vi.fn(),
      setStatus: vi.fn(),
      logger,
    })
    workspaceWatcher.restart()
    await vi.waitFor(() => expect(watcherMock.subscribe).toHaveBeenCalled())
    watcherMock.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe failed'))
    workspaceWatcher.restart()
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('watcher close failed', expect.any(Object)),
    )
    workspaceWatcher.dispose()
  })
})
