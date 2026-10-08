import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FsGraph } from '@electron/services/workspace/types'
import {
  cleanupWorkspaceFixtures,
  createGraph,
  createKnowledgeServiceMock,
  createWorkspace,
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

const indexStartCount = (logger: Awaited<ReturnType<typeof createWorkspace>>['logger']) =>
  vi
    .mocked(logger.info)
    .mock.calls.filter(
      ([message, context]) =>
        message === 'search index task started' && context?.task === 'workspace-index',
    ).length

describe('WorkspaceAnalysisService renderer hydration gate', () => {
  it('defers automatic index and graph work until the renderer is interactive', async () => {
    vi.useFakeTimers()
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0, workspaceIndexPrecomputeDelayMs: 0 },
    )

    try {
      await vi.runAllTimersAsync()

      expect(indexStartCount(logger)).toBe(0)
      expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()

      workspace.markRendererInteractive()
      await vi.runAllTimersAsync()

      await vi.waitFor(() => {
        expect(indexStartCount(logger)).toBe(1)
        expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
      })
    } finally {
      workspace.dispose()
    }
  })

  it('schedules automatic analysis only once for repeated interactive notifications', async () => {
    vi.useFakeTimers()
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0, workspaceIndexPrecomputeDelayMs: 0 },
    )

    try {
      workspace.markRendererInteractive()
      workspace.markRendererInteractive()
      await vi.runAllTimersAsync()

      await vi.waitFor(() => {
        expect(indexStartCount(logger)).toBe(1)
        expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
      })
    } finally {
      workspace.dispose()
    }
  })

  it('cancels pending automatic analysis when hydration begins again', async () => {
    vi.useFakeTimers()
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 50, workspaceIndexPrecomputeDelayMs: 50 },
    )

    try {
      workspace.markRendererInteractive()
      workspace.beginRendererHydration()
      await vi.runAllTimersAsync()

      expect(indexStartCount(logger)).toBe(0)
      expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()
    } finally {
      workspace.dispose()
    }
  })

  it('keeps a running graph task visible until it settles after hydration begins', async () => {
    vi.useFakeTimers()
    let finishGraph!: (graph: FsGraph) => void
    const pendingGraph = new Promise<FsGraph>((resolve) => {
      finishGraph = resolve
    })
    const service = createKnowledgeServiceMock()
    service.buildWorkspaceGraph.mockReturnValueOnce(pendingGraph)
    const { workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0, workspaceIndexPrecomputeDelayMs: 60_000 },
    )

    try {
      workspace.markRendererInteractive()
      await vi.advanceTimersByTimeAsync(0)
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())
      expect(graphTaskStatus(workspace)).toBe('running')
      const graphRequest = workspace.workspaceGraph()

      workspace.beginRendererHydration()
      expect(graphTaskStatus(workspace)).toBe('running')

      finishGraph(createGraph('mindmap'))
      await graphRequest

      expect(graphTaskStatus(workspace)).toBe('idle')
    } finally {
      finishGraph(createGraph('mindmap'))
      workspace.dispose()
    }
  })

  it('keeps a running graph task visible until it settles while switching to a single file', async () => {
    vi.useFakeTimers()
    let finishGraph!: (graph: FsGraph) => void
    const pendingGraph = new Promise<FsGraph>((resolve) => {
      finishGraph = resolve
    })
    const service = createKnowledgeServiceMock()
    service.buildWorkspaceGraph.mockReturnValueOnce(pendingGraph)
    const { root, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0, workspaceIndexPrecomputeDelayMs: 60_000 },
    )

    try {
      workspace.markRendererInteractive()
      await vi.advanceTimersByTimeAsync(0)
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())
      const graphRequest = workspace.workspaceGraph()

      await workspace.setSingleFile({ path: path.join(root, 'alpha.md') })
      expect(graphTaskStatus(workspace)).toBe('running')

      finishGraph(createGraph('mindmap'))
      await graphRequest

      expect(graphTaskStatus(workspace)).toBe('idle')
    } finally {
      finishGraph(createGraph('mindmap'))
      workspace.dispose()
    }
  })

  it('returns to waiting after switching the workspace root', async () => {
    vi.useFakeTimers()
    const service = createKnowledgeServiceMock()
    const { logger, root, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0, workspaceIndexPrecomputeDelayMs: 0 },
    )
    const nextRoot = path.join(root, 'next-workspace')
    await fs.mkdir(nextRoot)
    await fs.writeFile(path.join(nextRoot, 'beta.md'), '# Beta', 'utf8')

    try {
      workspace.markRendererInteractive()
      await vi.runAllTimersAsync()
      await vi.waitFor(() => {
        expect(indexStartCount(logger)).toBe(1)
        expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
      })
      vi.mocked(logger.info).mockClear()
      service.buildWorkspaceGraph.mockClear()

      await workspace.setRoot({ path: nextRoot })
      await vi.runAllTimersAsync()

      expect(indexStartCount(logger)).toBe(0)
      expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()

      workspace.markRendererInteractive()
      await vi.runAllTimersAsync()

      await vi.waitFor(() => {
        expect(indexStartCount(logger)).toBe(1)
        expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
      })
    } finally {
      workspace.dispose()
    }
  })

  it('keeps an interactive renderer active when the root does not change', async () => {
    vi.useFakeTimers()
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(
      service,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0, workspaceIndexPrecomputeDelayMs: 0 },
    )

    try {
      workspace.markRendererInteractive()
      await vi.runAllTimersAsync()
      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())
      service.buildWorkspaceGraph.mockClear()

      await workspace.setRoot({ path: root })
      await fs.writeFile(path.join(root, 'alpha.md'), '# Changed Alpha', 'utf8')
      workspace.invalidateAllExternalPaths()
      await vi.runAllTimersAsync()

      await vi.waitFor(() => expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce())
    } finally {
      workspace.dispose()
    }
  })

  it('allows explicit index and graph queries while hydration is in progress', async () => {
    vi.useFakeTimers()
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(service, [
      { path: 'alpha.md', content: '# Alpha' },
    ])

    try {
      workspace.beginRendererHydration()
      await workspace.workspaceIndex()
      await workspace.workspaceGraph()

      expect(indexStartCount(logger)).toBe(1)
      expect(service.buildWorkspaceGraph).toHaveBeenCalledOnce()
    } finally {
      workspace.dispose()
    }
  })
})

const graphTaskStatus = (workspace: Awaited<ReturnType<typeof createWorkspace>>['workspace']) =>
  workspace.getBackgroundTasks().find(({ id }) => id === 'workspace-graph')?.status
