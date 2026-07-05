import fs from 'node:fs/promises'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { Logger } from '@electron/services/logger.js'
import type { FsGraph } from '@electron/services/workspace/types.js'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService.js'
import { WorkspaceGraphCache } from '@electron/services/workspace/workspaceGraphCache.js'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('WorkspaceGraphCache', () => {
  it('keys workspace graphs by document path, content hash, and known paths', () => {
    const cache = new WorkspaceGraphCache()
    const graph = createGraph('mindmap')
    const documents = [{ path: 'alpha.md', content: '# Alpha' }]
    const knownPaths = { paths: ['alpha.md'], assetPaths: [] }

    cache.setWorkspaceGraph(documents, knownPaths, graph)

    expect(cache.getWorkspaceGraph(documents, { paths: ['alpha.md'], assetPaths: [] })).toBe(graph)
    expect(
      cache.getWorkspaceGraph([{ path: 'alpha.md', content: '# Changed' }], knownPaths),
    ).toBeUndefined()
    expect(
      cache.getWorkspaceGraph(documents, { paths: ['alpha.md', 'beta.md'], assetPaths: [] }),
    ).toBeUndefined()
  })

  it('evicts the least recently used workspace graph when the cache is full', () => {
    const cache = new WorkspaceGraphCache(2)
    const firstGraph = createGraph('mindmap')
    const secondGraph = createGraph('mindmap')
    const thirdGraph = createGraph('mindmap')
    const firstDocuments = [{ path: 'first.md', content: '# First' }]
    const secondDocuments = [{ path: 'second.md', content: '# Second' }]
    const thirdDocuments = [{ path: 'third.md', content: '# Third' }]

    cache.setWorkspaceGraph(firstDocuments, createKnownPaths('first.md'), firstGraph)
    cache.setWorkspaceGraph(secondDocuments, createKnownPaths('second.md'), secondGraph)
    expect(cache.getWorkspaceGraph(firstDocuments, createKnownPaths('first.md'))).toBe(firstGraph)

    cache.setWorkspaceGraph(thirdDocuments, createKnownPaths('third.md'), thirdGraph)

    expect(cache.getWorkspaceGraph(secondDocuments, createKnownPaths('second.md'))).toBeUndefined()
    expect(cache.getWorkspaceGraph(firstDocuments, createKnownPaths('first.md'))).toBe(firstGraph)
    expect(cache.getWorkspaceGraph(thirdDocuments, createKnownPaths('third.md'))).toBe(thirdGraph)
  })
})

describe('WorkspaceAnalysisService sidecar graph', () => {
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
    } finally {
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
      workspace.dispose()
    }
  })

  it('reuses cached outline graphs until active content changes', async () => {
    const firstGraph = createGraph('outline')
    const secondGraph = createGraph('outline')
    const service = createKnowledgeServiceMock()
    service.buildOutlineGraph.mockResolvedValueOnce(firstGraph).mockResolvedValueOnce(secondGraph)
    const { workspace } = await createWorkspace(service, [
      { path: 'alpha.md', content: '# Persisted Alpha' },
    ])

    try {
      await expect(workspace.outlineGraph({ path: 'alpha.md' })).resolves.toBe(firstGraph)
      await expect(workspace.outlineGraph({ path: 'alpha.md' })).resolves.toBe(firstGraph)
      expect(service.buildOutlineGraph).toHaveBeenCalledTimes(1)

      workspace.updateBuffer({ path: 'alpha.md', content: '# Dirty Alpha' })

      await expect(workspace.outlineGraph({ path: 'alpha.md' })).resolves.toBe(secondGraph)
      expect(service.buildOutlineGraph).toHaveBeenCalledTimes(2)
    } finally {
      workspace.dispose()
    }
  })

  it('routes outline graph calculation with the active buffer content', async () => {
    const graph = createGraph('outline')
    const service = createKnowledgeServiceMock({ outlineGraph: graph })
    const { root, workspace } = await createWorkspace(service, [
      { path: 'alpha.md', content: '# Persisted Alpha' },
    ])

    try {
      workspace.updateBuffer({ path: 'alpha.md', content: '# Dirty Alpha' })

      await expect(workspace.outlineGraph({ path: 'alpha.md' })).resolves.toBe(graph)

      const [sessionToken, workspaceRoot, relativePath, content] = service.buildOutlineGraph.mock
        .calls[0] as [string, string, string, string]

      expect(sessionToken).toEqual(expect.stringMatching(/^vfs:/))
      expect(workspaceRoot).toBe(root)
      expect(relativePath).toBe('alpha.md')
      expect(content).toBe('# Dirty Alpha')
    } finally {
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
    undefined,
    service,
  )
  await workspace.setRoot({ path: root })
  return { logger, root, workspace }
}

const tempDir = () => path.resolve(process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? '.')

type KnowledgeGraphServiceMock = KnowledgeEngineService & {
  readWorkspaceFile: ReturnType<typeof vi.fn>
  buildOutlineGraph: ReturnType<typeof vi.fn>
  buildWorkspaceGraph: ReturnType<typeof vi.fn>
}

const createKnowledgeServiceMock = (
  graphs: { outlineGraph?: FsGraph; workspaceGraph?: FsGraph } = {},
): KnowledgeGraphServiceMock =>
  ({
    buildOutlineGraph: vi.fn(async () => graphs.outlineGraph ?? createGraph('outline')),
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

const createKnownPaths = (pathValue: string): { paths: string[]; assetPaths: string[] } => ({
  paths: [pathValue],
  assetPaths: [],
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
