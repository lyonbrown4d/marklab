import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceWatcher } from '@electron/services/workspace/workspaceWatcher.js'
import type { FsStateData } from '@electron/services/workspace/types.js'

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
      expect(watcherMock.subscribe).toHaveBeenCalledWith(root, expect.any(Function)),
    )

    const callback = watcherMock.subscribe.mock.calls[0]?.[1]
    callback(null, [{ path: path.join(root, 'notes.md'), type: 'update' }])

    expect(changed).toEqual([{ path: path.join(root, 'notes.md'), eventName: 'change' }])
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

    expect(changed).toEqual([{ path: path.join(root, 'notes.md'), eventName: 'change' }])

    workspaceWatcher.dispose()
  })
})
