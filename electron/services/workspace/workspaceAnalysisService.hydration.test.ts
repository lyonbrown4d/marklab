import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cleanupWorkspaceFixtures,
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
        expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()
      })
    } finally {
      workspace.dispose()
    }
  })

  it('waits 1500 ms before optional index prewarming but serves an explicit query immediately', async () => {
    const service = createKnowledgeServiceMock()
    const { logger, workspace } = await createWorkspace(service, [
      { path: 'alpha.md', content: '# Alpha' },
    ])
    vi.useFakeTimers()
    try {
      workspace.markRendererInteractive()
      await vi.advanceTimersByTimeAsync(1499)
      expect(indexStartCount(logger)).toBe(0)
      await workspace.workspaceIndex()
      expect(indexStartCount(logger)).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(indexStartCount(logger)).toBe(1)
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
        expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()
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
      await workspace.workspaceGraph()
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
        expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()
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
      await workspace.workspaceGraph()
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
