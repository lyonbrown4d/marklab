import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { Logger } from '@electron/services/logger.js'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService.js'

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

  it('falls back to node filesystem when a sidecar mutation fails', async () => {
    const service = createKnowledgeServiceMock()
    service.createWorkspaceFile.mockRejectedValueOnce(new Error('sidecar unavailable'))
    const { logger, root, workspace } = await createWorkspace(service)

    await workspace.createFile({ path: 'notes/a.md' })

    expect(fsSync.existsSync(path.join(root, 'notes', 'a.md'))).toBe(true)
    expect(logger.warn).toHaveBeenCalledWith(
      'workspace vfs mutation failed; falling back to node filesystem',
      expect.objectContaining({ path: 'notes/a.md' }),
    )

    workspace.dispose()
  })
})

const createWorkspace = async (service: KnowledgeEngineService) => {
  const tempRoot = await fs.mkdtemp(
    path.join(process.env.TEMP ?? process.env.TMP ?? '.', 'marklab-workspace-sidecar-'),
  )
  tempRoots.push(tempRoot)
  const appData = path.join(tempRoot, 'app-data')
  const root = path.join(tempRoot, 'workspace')
  await fs.mkdir(root, { recursive: true })
  const logger = createLogger()
  const workspace = new WorkspaceFileService(createApp(appData), createShell(), logger, service)
  await workspace.setRoot({ path: root })
  return { logger, root, workspace }
}

const createKnowledgeServiceMock = () =>
  ({
    createWorkspaceDirectory: vi.fn(async () => ({ changed: true, kind: 'folder' as const })),
    createWorkspaceFile: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    deleteWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    renameWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
  }) as unknown as KnowledgeEngineService & {
    createWorkspaceDirectory: ReturnType<typeof vi.fn>
    createWorkspaceFile: ReturnType<typeof vi.fn>
    deleteWorkspacePath: ReturnType<typeof vi.fn>
    renameWorkspacePath: ReturnType<typeof vi.fn>
  }

const createLogger = (): Logger & { warn: ReturnType<typeof vi.fn> } => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger & { warn: ReturnType<typeof vi.fn> }
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
