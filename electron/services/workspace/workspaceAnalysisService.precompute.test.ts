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

afterEach(async () => {
  vi.useRealTimers()
  await cleanupWorkspaceFixtures()
})

describe('WorkspaceAnalysisService background precompute', () => {
  it('precomputes the workspace index after the renderer becomes interactive', async () => {
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { workspaceIndexPrecomputeDelayMs: 0 },
    )

    try {
      workspace.markRendererInteractive()
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

  it('loads the graph only when requested and shares an in-flight request', async () => {
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
      {
        graphPrecomputeDelayMs: 0,
      },
    )
    try {
      vi.useFakeTimers()
      workspace.markRendererInteractive()
      await vi.runAllTimersAsync()
      await workspace.workspaceIndex()
      expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()
      const request = workspace.workspaceGraph()
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())
      const secondRequest = workspace.workspaceGraph()
      finishGraph(graph)
      await expectGraphWithRevision(request, graph)
      await expectGraphWithRevision(secondRequest, graph)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
    } finally {
      finishGraph(graph)
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
      await workspace.workspaceGraph()
      workspace.markRendererInteractive()
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()

      await workspace.openFile({ path: 'alpha.md' })
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
      await workspace.workspaceGraph()
      workspace.markRendererInteractive()
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
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

  it.each(['hydration', 'single file'] as const)(
    'keeps a started graph prewarm visible until it settles during %s',
    async (transition) => {
      const service = createKnowledgeServiceMock()
      const { root, workspace } = await createWorkspace(
        service,
        [{ path: 'alpha.md', content: '# Alpha' }],
        {
          graphPrecomputeDelayMs: 0,
          workspaceIndexPrecomputeDelayMs: 60_000,
        },
      )
      let finish!: (graph: FsGraph) => void
      const pendingGraph = new Promise<FsGraph>((resolve) => {
        finish = resolve
      })
      try {
        await workspace.workspaceGraph()
        service.buildWorkspaceGraph.mockReturnValueOnce(pendingGraph)
        await fs.writeFile(path.join(root, 'alpha.md'), '# Changed Alpha', 'utf8')
        vi.useFakeTimers()
        workspace.markRendererInteractive()
        workspace.invalidateAllExternalPaths()
        await vi.advanceTimersByTimeAsync(0)
        await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledTimes(2))
        const graphTaskStatus = () =>
          workspace.getBackgroundTasks().find(({ id }) => id === 'workspace-graph')?.status
        expect(graphTaskStatus()).toBe('running')
        if (transition === 'hydration') workspace.beginRendererHydration()
        else await workspace.setSingleFile({ path: path.join(root, 'alpha.md') })
        expect(graphTaskStatus()).toBe('running')
        finish(createGraph('mindmap'))
        await vi.waitFor(() => expect(graphTaskStatus()).toBe('idle'))
      } finally {
        finish(createGraph('mindmap'))
        workspace.dispose()
      }
    },
  )
})
