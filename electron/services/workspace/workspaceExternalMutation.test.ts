import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { App, Shell } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'

vi.mock('@parcel/watcher', () => ({
  default: {
    subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })),
  },
}))

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('WorkspaceFileService external mutations', () => {
  it('runs a sync write through the workspace boundary and invalidates cached files', async () => {
    const { root, workspace } = await createWorkspace()
    const absolutePath = path.join(root, 'note.md')
    await fs.writeFile(absolutePath, 'before')
    await expect(workspace.openFile({ path: 'note.md' })).resolves.toBe('before')

    await workspace.runExternalPathMutation(['note.md'], () => fs.writeFile(absolutePath, 'after'))
    await expect(workspace.openFile({ path: 'note.md' })).resolves.toBe('before')

    workspace.invalidateExternalPaths(['note.md'])
    await expect(workspace.openFile({ path: 'note.md' })).resolves.toBe('after')
    workspace.dispose()
  })

  it('rejects an escaping path before running external work', async () => {
    const { workspace } = await createWorkspace()
    const work = vi.fn(async () => undefined)

    await expect(workspace.runExternalPathMutation(['../escape.md'], work)).rejects.toThrow()
    expect(work).not.toHaveBeenCalled()
    workspace.dispose()
  })

  it('invalidates all cached files after a workspace-wide mutation', async () => {
    const { root, workspace } = await createWorkspace()
    const absolutePath = path.join(root, 'note.md')
    await fs.writeFile(absolutePath, 'before')
    await workspace.openFile({ path: 'note.md' })

    await workspace.runExternalWorkspaceMutation(() => fs.writeFile(absolutePath, 'after'))
    workspace.invalidateAllExternalPaths()

    await expect(workspace.openFile({ path: 'note.md' })).resolves.toBe('after')
    workspace.dispose()
  })
})

const createWorkspace = async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-external-mutation-'))
  roots.push(parent)
  const root = path.join(parent, 'workspace')
  const userData = path.join(parent, 'user-data')
  await fs.mkdir(root)
  const workspace = new WorkspaceFileService(
    createApp(userData),
    createShell(),
    createLogger(),
    createLocalHistory(),
  )
  await workspace.setRoot({ path: root })
  return { root, workspace }
}

const createApp = (userData: string): App =>
  ({ getPath: vi.fn(() => userData), on: vi.fn(), removeListener: vi.fn() }) as unknown as App

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

const createLocalHistory = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' })),
  }) as unknown as LocalHistoryServiceContract
