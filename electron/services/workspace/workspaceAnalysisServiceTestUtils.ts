import fs from 'node:fs/promises'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { expect, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import type { FsGraph } from '@electron/services/workspace/types'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService'

const tempRoots: string[] = []

export const cleanupWorkspaceFixtures = async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
}

type WorkspaceFixture = {
  path: string
  content: string
}

type KnowledgeGraphServiceMock = KnowledgeEngineService & {
  readWorkspaceFile: ReturnType<typeof vi.fn>
  buildWorkspaceGraph: ReturnType<typeof vi.fn>
}

export const createWorkspace = async (
  service: KnowledgeGraphServiceMock,
  files: WorkspaceFixture[] = [],
  options: {
    graphPrecomputeDelayMs?: number
    workspaceIndexPrecomputeDelayMs?: number
  } = {},
) => {
  const tempRoot = await fs.mkdtemp(path.join(tempDir(), 'marklab-workspace-analysis-'))
  tempRoots.push(tempRoot)
  const appData = path.join(tempRoot, 'app-data')
  const root = path.join(tempRoot, 'workspace')
  await fs.mkdir(root, { recursive: true })
  await Promise.all(files.map((file) => writeWorkspaceFile(root, file)))
  service.readWorkspaceFile = vi.fn(async (_workspaceId, workspaceRoot, relativePath) =>
    fs.readFile(path.join(workspaceRoot, ...relativePath.split('/')), 'utf8'),
  )
  const logger = createLogger()
  const workspace = new WorkspaceAnalysisService(
    createApp(appData),
    createShell(),
    logger,
    createLocalHistoryService(),
    undefined,
    service,
    options,
  )
  await workspace.setRoot({ path: root })
  return { logger, root, workspace }
}

export const createKnowledgeServiceMock = (
  graphs: { workspaceGraph?: FsGraph } = {},
): KnowledgeGraphServiceMock =>
  ({
    buildWorkspaceGraph: vi.fn(async () => graphs.workspaceGraph ?? createGraph('mindmap')),
    readWorkspaceFile: vi.fn(),
  }) as unknown as KnowledgeGraphServiceMock

export const createGraph = (mode: FsGraph['mode']): FsGraph => ({
  edges: [],
  mode,
  nodes: [{ id: 'file:alpha.md', kind: 'file', label: 'alpha.md', path: 'alpha.md' }],
})

export const expectGraphWithRevision = async (
  request: Promise<FsGraph>,
  graph: FsGraph,
): Promise<void> => {
  await expect(request).resolves.toEqual({
    ...graph,
    revision: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
}

const writeWorkspaceFile = async (root: string, file: WorkspaceFixture) => {
  const fullPath = path.join(root, ...file.path.split('/'))
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, file.content, 'utf8')
}

const tempDir = () => path.resolve(process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? '.')

const createLocalHistoryService = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' as const })),
  }) as unknown as LocalHistoryServiceContract

const createLogger = (): Logger & { error: ReturnType<typeof vi.fn> } => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger & { error: ReturnType<typeof vi.fn> }
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
