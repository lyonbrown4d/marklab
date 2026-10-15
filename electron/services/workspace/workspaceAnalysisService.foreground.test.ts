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

describe('workspace analysis in background windows', () => {
  it('keeps explicit queries and dirty saves available, then warms only stale graph data', async () => {
    const knowledge = createKnowledgeServiceMock()
    const { root, workspace, logger } = await createWorkspace(
      knowledge,
      [{ path: 'alpha.md', content: '# Alpha' }],
      { graphPrecomputeDelayMs: 0, workspaceIndexPrecomputeDelayMs: 0 },
    )
    vi.useFakeTimers()
    try {
      workspace.setWindowForeground(false)
      workspace.markRendererInteractive()
      await vi.runAllTimersAsync()
      expect(knowledge.buildWorkspaceGraph).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalledWith('search index task started', expect.anything())

      await workspace.workspaceGraph()
      await workspace.workspaceIndex()
      expect(knowledge.buildWorkspaceGraph).toHaveBeenCalledOnce()
      await workspace.openFile({ path: 'alpha.md' })
      workspace.updateBuffer({ path: 'alpha.md', content: '# Saved while backgrounded' })
      await workspace.flushBuffers()
      expect(await fs.readFile(path.join(root, 'alpha.md'), 'utf8')).toBe(
        '# Saved while backgrounded',
      )
      await vi.runAllTimersAsync()
      expect(knowledge.buildWorkspaceGraph).toHaveBeenCalledOnce()

      workspace.setWindowForeground(true)
      await vi.runAllTimersAsync()
      await vi.waitFor(() => expect(knowledge.buildWorkspaceGraph).toHaveBeenCalledTimes(2))
      workspace.setWindowForeground(false)
      workspace.setWindowForeground(true)
      await vi.runAllTimersAsync()
      expect(knowledge.buildWorkspaceGraph).toHaveBeenCalledTimes(2)
    } finally {
      workspace.dispose()
    }
  })
})
