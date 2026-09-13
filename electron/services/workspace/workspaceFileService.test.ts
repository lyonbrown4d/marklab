import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import type { App, Shell } from 'electron'
import watcher from '@parcel/watcher'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { Logger } from '@electron/services/logger.js'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService.js'

vi.mock('@parcel/watcher', () => ({
  default: {
    subscribe: vi.fn(async () => ({
      unsubscribe: vi.fn(async () => undefined),
    })),
  },
}))

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('WorkspaceFileService sidecar mutations', () => {
  it('routes structural mutations to the knowledge sidecar when available', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)

    await workspace.createDir({ path: 'notes' })
    await workspace.createFile({ path: 'notes/a.md' })
    await workspace.renamePath({ from: 'notes/a.md', to: 'notes/b.md' })
    await workspace.deletePath({ path: 'notes/b.md' })

    expect(service.createWorkspaceDirectory).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes',
    )
    expect(service.createWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
    )
    expect(service.renameWorkspacePath).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
      'notes/b.md',
    )
    expect(service.deleteWorkspacePath).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/b.md',
    )
    expect(fsSync.existsSync(path.join(root, 'notes'))).toBe(false)

    workspace.dispose()
  })

  it('creates files with initial content through the knowledge sidecar', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)

    await workspace.createFile({ path: 'notes/a.md', content: '# A\n' })

    expect(service.createWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
    )
    expect(service.writeWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
      '# A\n',
    )
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: false })

    workspace.dispose()
  })

  it('routes buffer flush writes to the knowledge sidecar when available', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)

    workspace.updateBuffer({ path: 'notes/a.md', content: '# A' })

    await expect(workspace.flushBuffers()).resolves.toBeUndefined()

    expect(service.writeWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
      '# A',
    )
    expect(await fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).toBe('# A')
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: false })

    workspace.dispose()
  })

  it('propagates sidecar write failures instead of falling back to node filesystem', async () => {
    const service = createKnowledgeServiceMock()
    const error = new Error('sidecar unavailable')
    service.writeWorkspaceFile.mockRejectedValueOnce(error)
    const { logger, root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)

    workspace.updateBuffer({ path: 'notes/a.md', content: '# A' })

    await expect(workspace.flushBuffers()).rejects.toMatchObject({ errors: [error] })

    expect(await fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).toBe('# Initial')
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: true })
    expect(logger.error).toHaveBeenCalledWith(
      'workspace vfs write failed',
      expect.objectContaining({ path: 'notes/a.md' }),
    )

    await expect(workspace.flushBuffers()).resolves.toBeUndefined()
    expect(await fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).toBe('# A')
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: false })
    workspace.dispose()
  })

  it('propagates sidecar mutation failures instead of falling back to node filesystem', async () => {
    const service = createKnowledgeServiceMock()
    service.createWorkspaceFile.mockRejectedValueOnce(new Error('sidecar unavailable'))
    const { logger, root, workspace } = await createWorkspace(service)

    await expect(workspace.createFile({ path: 'notes/a.md' })).rejects.toThrow(
      'sidecar unavailable',
    )

    expect(fsSync.existsSync(path.join(root, 'notes', 'a.md'))).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      'workspace vfs mutation failed',
      expect.objectContaining({ path: 'notes/a.md' }),
    )

    workspace.dispose()
  })
})

describe('WorkspaceFileService background tasks', () => {
  it('does not emit changed events when reading unchanged task state', async () => {
    const service = createKnowledgeServiceMock()
    const { workspace } = await createWorkspace(service)
    await settleWatcherTasks()
    const listener = vi.fn()

    const dispose = workspace.onBackgroundTasksChanged(listener)
    expect(listener).toHaveBeenCalledTimes(1)

    listener.mockClear()
    workspace.getBackgroundTasks()
    workspace.getBackgroundTasks()

    expect(listener).not.toHaveBeenCalled()

    dispose()
    workspace.dispose()
  })
})

describe('WorkspaceFileService root switching', () => {
  it('rejects invalid selections without changing the current root', async () => {
    const { root, workspace } = await createWorkspace(createKnowledgeServiceMock())
    const file = path.join(root, 'note.md')
    await fs.writeFile(file, '# Note')
    await expect(workspace.setRoot({ path: file })).rejects.toThrow('not a directory')
    await expect(workspace.setSingleFile({ path: root })).rejects.toThrow('not a file')
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    await expect(workspace.setSingleFile({ path: file })).resolves.toEqual({
      kind: 'single',
      path: file,
    })
    workspace.dispose()
  })

  it('does not restart the watcher when setting the same external root', async () => {
    const service = createKnowledgeServiceMock()
    const { logger, root, workspace } = await createWorkspace(service)
    await settleWatcherTasks()
    const subscribe = vi.mocked(watcher.subscribe)
    const subscribeCalls = subscribe.mock.calls.length
    logger.info.mockClear()

    await expect(workspace.setRoot({ path: root })).resolves.toEqual({
      kind: 'external',
      path: root,
    })

    expect(subscribe).toHaveBeenCalledTimes(subscribeCalls)
    expect(logger.info).not.toHaveBeenCalledWith('workspace root changed', expect.anything())

    workspace.dispose()
  })
})

const prepareBufferForSave = async (
  root: string,
  workspace: WorkspaceFileService,
  service: ReturnType<typeof createKnowledgeServiceMock>,
): Promise<void> => {
  await fs.mkdir(path.join(root, 'notes'))
  await fs.writeFile(path.join(root, 'notes/a.md'), '# Initial')
  service.readWorkspaceFile.mockResolvedValueOnce('# Initial')
  service.writeWorkspaceFile.mockImplementation(
    async (_id: string, workspaceRoot: string, relativePath: string, content: string) => {
      await fs.writeFile(path.join(workspaceRoot, relativePath), content)
      return { changed: true, kind: 'file' as const }
    },
  )
  await workspace.openFile({ path: 'notes/a.md' })
}

const createWorkspace = async (service: KnowledgeEngineService) => {
  const tempRoot = await fs.mkdtemp(path.join(tempDir(), 'marklab-workspace-sidecar-'))
  tempRoots.push(tempRoot)
  const appData = path.join(tempRoot, 'app-data')
  const root = path.join(tempRoot, 'workspace')
  await fs.mkdir(root, { recursive: true })
  const logger = createLogger()
  const workspace = new WorkspaceFileService(createApp(appData), createShell(), logger, service)
  await workspace.setRoot({ path: root })
  return { logger, root, workspace }
}

const tempDir = () => path.resolve(process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? '.')

const settleWatcherTasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const createKnowledgeServiceMock = () =>
  ({
    createWorkspaceDirectory: vi.fn(async () => ({ changed: true, kind: 'folder' as const })),
    createWorkspaceFile: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    deleteWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    renameWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    readWorkspaceFile: vi.fn<() => Promise<string>>(),
    writeWorkspaceFile: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
  }) as unknown as KnowledgeEngineService & {
    createWorkspaceDirectory: ReturnType<typeof vi.fn>
    createWorkspaceFile: ReturnType<typeof vi.fn>
    deleteWorkspacePath: ReturnType<typeof vi.fn>
    renameWorkspacePath: ReturnType<typeof vi.fn>
    readWorkspaceFile: ReturnType<typeof vi.fn>
    writeWorkspaceFile: ReturnType<typeof vi.fn>
  }

const createLogger = (): Logger & {
  error: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
} => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger & {
    error: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
  }
  return logger
}

const createApp = (userDataPath: string): App =>
  ({
    getPath: vi.fn(() => userDataPath),
    on: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as App

const createShell = (): Shell =>
  ({
    openPath: vi.fn(async () => ''),
  }) as unknown as Shell
