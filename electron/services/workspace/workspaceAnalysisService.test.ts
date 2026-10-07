import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FsGraph } from '@electron/services/workspace/types'
import {
  cleanupWorkspaceFixtures,
  createGraph,
  createKnowledgeServiceMock,
  createWorkspace,
  expectGraphWithRevision,
} from '@electron/services/workspace/workspaceAnalysisServiceTestUtils'

vi.mock('@electron/services/workspace/workspaceAnalysisWorkerClient', () => ({
  WorkspaceAnalysisWorkerClient: class {
    run() {
      return Promise.resolve({ files: [], paths: [], asset_paths: [] })
    }

    terminate() {}
  },
}))

afterEach(cleanupWorkspaceFixtures)

describe('WorkspaceAnalysisService sidecar graph', () => {
  it('precomputes the workspace index after a root switch', async () => {
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { workspaceIndexPrecomputeDelayMs: 0 },
    )

    try {
      await vi.waitFor(() =>
        expect(logger.info).toHaveBeenCalledWith(
          'search index task started',
          expect.objectContaining({ task: 'workspace-index' }),
        ),
      )
    } finally {
      workspace.dispose()
    }
  })

  it('does not report a new task when the workspace index is already cached', async () => {
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(service, [
      { path: 'alpha.md', content: '# Alpha' },
    ])

    try {
      await workspace.workspaceIndex()
      await workspace.workspaceIndex()

      const starts = vi
        .mocked(logger.info)
        .mock.calls.filter(
          ([message, context]) =>
            message === 'search index task started' && context?.task === 'workspace-index',
        )
      expect(starts).toHaveLength(1)
    } finally {
      workspace.dispose()
    }
  })

  it('precomputes the graph after opening a workspace without blocking the root switch', async () => {
    let finishGraph!: (graph: FsGraph) => void
    const pendingGraph = new Promise<FsGraph>((resolve) => {
      finishGraph = resolve
    })
    const graph = createGraph('mindmap')
    const service = createKnowledgeServiceMock()
    service.buildWorkspaceGraph.mockReturnValueOnce(pendingGraph)

    const { workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0 },
    )

    try {
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())
      const request = workspace.workspaceGraph()
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()

      finishGraph(graph)

      await expectGraphWithRevision(request, graph)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
    } finally {
      finishGraph(graph)
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

  it('debounces a fresh graph precompute after buffered changes are saved', async () => {
    const service = createKnowledgeServiceMock()
    const { workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0 },
    )

    try {
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())

      workspace.updateBuffer({ path: 'alpha.md', content: '# Changed Alpha' })
      await workspace.flushBuffers()

      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(2))
      const documents = service.buildWorkspaceGraph.mock.calls[1]?.[2] as Array<{
        content: string
        path: string
      }>
      expect(documents).toContainEqual(
        expect.objectContaining({ path: 'alpha.md', content: '# Changed Alpha' }),
      )
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

  it('precomputes a fresh graph after an external workspace invalidation', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0 },
    )

    try {
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())
      await fs.writeFile(path.join(root, 'alpha.md'), '# External Alpha', 'utf8')

      workspace.invalidateAllExternalPaths()

      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(2))
      const documents = service.buildWorkspaceGraph.mock.calls[1]?.[2] as Array<{
        content: string
        path: string
      }>
      expect(documents).toContainEqual(
        expect.objectContaining({ path: 'alpha.md', content: '# External Alpha' }),
      )
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

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
      await expectGraphWithRevision(workspace.workspaceGraph(), graph)

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
      await expectGraphWithRevision(workspace.workspaceGraph(), firstGraph)
      await expectGraphWithRevision(workspace.workspaceGraph(), firstGraph)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(1)

      workspace.updateBuffer({ path: 'alpha.md', content: '# Changed Alpha' })

      await expectGraphWithRevision(workspace.workspaceGraph(), secondGraph)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(2)

      workspace.updateBuffer({ path: 'alpha.md', content: '# Alpha' })
      await expectGraphWithRevision(workspace.workspaceGraph(), firstGraph)
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
