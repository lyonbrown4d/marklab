import fs from 'node:fs/promises'
import path from 'node:path'
import type { App, Shell } from 'electron'
import { vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'

const tempRoots: string[] = []

export const cleanupWorkspaceFileServiceFixtures = async (): Promise<void> => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
}

export const prepareBufferForSave = async (
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

export const createWorkspace = async (service: KnowledgeEngineService) => {
  const base = process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? '.'
  const tempRoot = await fs.mkdtemp(path.join(path.resolve(base), 'marklab-workspace-sidecar-'))
  tempRoots.push(tempRoot)
  const appData = path.join(tempRoot, 'app-data')
  const root = path.join(tempRoot, 'workspace')
  await fs.mkdir(root, { recursive: true })
  const logger = createLogger()
  const workspace = new WorkspaceFileService(
    createApp(appData),
    createShell(),
    logger,
    createLocalHistoryService(),
    service,
  )
  await workspace.setRoot({ path: root })
  return { logger, root, workspace }
}

export const settleWatcherTasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

export const createKnowledgeServiceMock = () =>
  ({
    createWorkspaceDirectory: vi.fn(async () => ({ changed: true, kind: 'folder' as const })),
    createWorkspaceFile: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    deleteWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    renameWorkspacePath: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
    readWorkspaceFile: vi.fn<() => Promise<string>>(),
    writeWorkspaceFile: vi.fn(async () => ({ changed: true, kind: 'file' as const })),
  }) as unknown as KnowledgeEngineService &
    Record<
      | 'createWorkspaceDirectory'
      | 'createWorkspaceFile'
      | 'deleteWorkspacePath'
      | 'renameWorkspacePath'
      | 'readWorkspaceFile'
      | 'writeWorkspaceFile',
      ReturnType<typeof vi.fn>
    >

const createLocalHistoryService = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' as const })),
  }) as unknown as LocalHistoryServiceContract

const createLogger = (): Logger & {
  info: ReturnType<typeof vi.fn>
} => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger & { info: ReturnType<typeof vi.fn> }
  return logger
}

const createApp = (userDataPath: string): App =>
  ({ getPath: vi.fn(() => userDataPath), on: vi.fn(), removeListener: vi.fn() }) as unknown as App

const createShell = (): Shell => ({ openPath: vi.fn(async () => '') }) as unknown as Shell
