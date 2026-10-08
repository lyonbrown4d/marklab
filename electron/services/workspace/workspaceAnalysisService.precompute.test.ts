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

  it('precomputes the graph without blocking the renderer', async () => {
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
      workspace.markRendererInteractive()
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
      workspace.markRendererInteractive()
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())

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
      workspace.markRendererInteractive()
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
})
