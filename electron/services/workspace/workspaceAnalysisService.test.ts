import fs from 'node:fs/promises'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types.js'
import type { Logger } from '@electron/services/logger.js'
import type { FsGraph } from '@electron/services/workspace/types.js'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService.js'

vi.mock('@electron/services/workspace/workspaceAnalysisWorkerClient.js', () => ({
  WorkspaceAnalysisWorkerClient: class {
    run() {
      return Promise.resolve({ files: [], paths: [], asset_paths: [] })
    }

    terminate() {}
  },
}))

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('WorkspaceAnalysisService sidecar graph', () => {
  it('shares one workspace snapshot across concurrent index and graph analysis', async () => {
    const service = createKnowledgeServiceMock()
    const { workspace } = await createWorkspace(service, [{ path: 'alpha.md', content: '# Alpha' }])

    try {
      await Promise.all([workspace.workspaceIndex(), workspace.workspaceGraph()])

      expect(service.readWorkspaceFile).toHaveBeenCalledOnce()
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

  it('deduplicates concurrent workspace graph builds', async () => {
    const service = createKnowledgeServiceMock()
    const { workspace } = await createWorkspace(service, [{ path: 'alpha.md', content: '# Alpha' }])

    try {
      const [first, second] = await Promise.all([
        workspace.workspaceGraph(),
        workspace.workspaceGraph(),
      ])

      expect(first).toBe(second)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

  it('passes markdown documents and known paths to the sidecar workspace graph builder', async () => {
    const graph = createGraph('mindmap')
    const service = createKnowledgeServiceMock({ workspaceGraph: graph })
    const { root, workspace } = await createWorkspace(service, [
      { path: 'alpha.md', content: '# Alpha\n\nSee [Beta](beta.md).' },
      { path: 'beta.md', content: '# Beta\n\nReferenced note.' },
      { path: 'assets/logo.png', content: 'not markdown' },
    ])

    try {
      await expect(workspace.workspaceGraph()).resolves.toBe(graph)

      const [sessionToken, workspaceRoot, documents, knownPaths] = service.buildWorkspaceGraph.mock
        .calls[0] as [
        string,
        string,
        Array<{ path: string; title: string; content: string }>,
        { paths: string[]; assetPaths: string[] },
      ]

      expect(sessionToken).toEqual(expect.stringMatching(/^vfs:/))
      expect(workspaceRoot).toBe(root)
      expect(documents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'alpha.md',
            title: 'alpha',
            content: '# Alpha\n\nSee [Beta](beta.md).',
          }),
          expect.objectContaining({
            path: 'beta.md',
            title: 'beta',
            content: '# Beta\n\nReferenced note.',
          }),
        ]),
      )
      expect(documents).toHaveLength(2)
      expect(knownPaths.paths).toEqual(
        expect.arrayContaining(['alpha.md', 'beta.md', 'assets/logo.png']),
      )
      expect(knownPaths.assetPaths).toEqual(expect.arrayContaining(['assets/logo.png']))
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

  it('reuses cached workspace graphs until document content changes', async () => {
    const firstGraph = createGraph('mindmap')
    const secondGraph = createGraph('mindmap')
    const service = createKnowledgeServiceMock()
    service.buildWorkspaceGraph.mockResolvedValueOnce(firstGraph).mockResolvedValueOnce(secondGraph)
    const { workspace } = await createWorkspace(service, [{ path: 'alpha.md', content: '# Alpha' }])

    try {
      await expect(workspace.workspaceGraph()).resolves.toBe(firstGraph)
      await expect(workspace.workspaceGraph()).resolves.toBe(firstGraph)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(1)

      workspace.updateBuffer({ path: 'alpha.md', content: '# Changed Alpha' })

      await expect(workspace.workspaceGraph()).resolves.toBe(secondGraph)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(2)

      workspace.updateBuffer({ path: 'alpha.md', content: '# Alpha' })
      await expect(workspace.workspaceGraph()).resolves.toBe(firstGraph)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(2)
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

  it('propagates sidecar workspace graph failures instead of falling back', async () => {
    const service = createKnowledgeServiceMock()
    service.buildWorkspaceGraph.mockRejectedValueOnce(new Error('sidecar graph failed'))
    const { logger, workspace } = await createWorkspace(service, [
      {
        path: 'alpha.md',
        content: '# Alpha\n\nThis would be enough for the local graph fallback.',
      },
    ])

    try {
      await expect(workspace.workspaceGraph()).rejects.toThrow('sidecar graph failed')

      expect(logger.error).toHaveBeenCalledWith(
        'workspace graph sidecar failed',
        expect.objectContaining({ error: expect.any(Error) }),
      )
      expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(1)
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })
})

type WorkspaceFixture = {
  path: string
  content: string
}

const createWorkspace = async (
  service: KnowledgeGraphServiceMock,
  files: WorkspaceFixture[] = [],
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
  )
  await workspace.setRoot({ path: root })
  return { logger, root, workspace }
}

const tempDir = () => path.resolve(process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? '.')

const createLocalHistoryService = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' as const })),
  }) as unknown as LocalHistoryServiceContract

type KnowledgeGraphServiceMock = KnowledgeEngineService & {
  readWorkspaceFile: ReturnType<typeof vi.fn>
  buildWorkspaceGraph: ReturnType<typeof vi.fn>
}

const createKnowledgeServiceMock = (
  graphs: { workspaceGraph?: FsGraph } = {},
): KnowledgeGraphServiceMock =>
  ({
    buildWorkspaceGraph: vi.fn(async () => graphs.workspaceGraph ?? createGraph('mindmap')),
    readWorkspaceFile: vi.fn(),
  }) as unknown as KnowledgeGraphServiceMock

const writeWorkspaceFile = async (root: string, file: WorkspaceFixture) => {
  const fullPath = path.join(root, ...file.path.split('/'))
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, file.content, 'utf8')
}

const createGraph = (mode: FsGraph['mode']): FsGraph => ({
  edges: [],
  mode,
  nodes: [{ id: 'file:alpha.md', kind: 'file', label: 'alpha.md', path: 'alpha.md' }],
})

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
