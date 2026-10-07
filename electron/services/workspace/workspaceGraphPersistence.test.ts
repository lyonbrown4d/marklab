import fs from 'node:fs/promises'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import { noopLogger } from '@electron/services/logger'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService'
import { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import type { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'
import type { FsGraph } from '@electron/services/workspace/types'

vi.mock('@electron/services/workspace/workspaceAnalysisWorkerClient', () => ({
  WorkspaceAnalysisWorkerClient: class {
    terminate() {}
  },
}))

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('WorkspaceAnalysisService persistent graph cache', () => {
  it('restores an exact graph revision before invoking the sidecar', async () => {
    const restored = graph('restored')
    const graphStore = createGraphStore({ restored })
    const { service, workspace } = await createWorkspace(graph('sidecar'), graphStore)

    try {
      await expect(workspace.workspaceGraph()).resolves.toEqual({
        ...restored,
        revision: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(graphStore.get).toHaveBeenCalledWith(
        expect.stringMatching(/^external:/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
      )
      expect(service.buildWorkspaceGraph).not.toHaveBeenCalled()
    } finally {
      workspace.dispose()
    }
  })

  it('persists a newly computed graph under its exact workspace revision', async () => {
    const computed = graph('computed')
    const graphStore = createGraphStore()
    const { workspace } = await createWorkspace(computed, graphStore)

    try {
      await expect(workspace.workspaceGraph()).resolves.toEqual({
        ...computed,
        revision: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(graphStore.save).toHaveBeenCalledWith(
        expect.stringMatching(/^external:/),
        expect.stringMatching(/^[a-f0-9]{64}$/),
        computed,
      )
    } finally {
      workspace.dispose()
    }
  })
})

const createWorkspace = async (computed: FsGraph, graphStore: WorkspaceGraphStore) => {
  const tempRoot = await fs.mkdtemp(path.join(tempDir(), 'marklab-graph-persistence-'))
  tempRoots.push(tempRoot)
  const appData = path.join(tempRoot, 'app-data')
  const root = path.join(tempRoot, 'workspace')
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path.join(root, 'alpha.md'), '# Alpha', 'utf8')
  const service = {
    buildWorkspaceGraph: vi.fn(async () => computed),
    readWorkspaceFile: vi.fn(async () => '# Alpha'),
  } as unknown as KnowledgeEngineService & {
    buildWorkspaceGraph: ReturnType<typeof vi.fn>
  }
  const workspace = new WorkspaceAnalysisService(
    createApp(appData),
    createShell(),
    noopLogger,
    createLocalHistoryService(),
    undefined,
    service,
    {
      graphPrecomputeDelayMs: 60_000,
      workspaceGraphScheduler: new WorkspaceGraphComputationScheduler({ concurrency: 1 }),
      workspaceGraphStore: graphStore,
    },
  )
  await workspace.setRoot({ path: root })
  return { service, workspace }
}

const createGraphStore = (options: { restored?: FsGraph } = {}) =>
  ({
    get: vi.fn(async () => options.restored),
    save: vi.fn(async () => undefined),
  }) as unknown as WorkspaceGraphStore

const graph = (label: string): FsGraph => ({
  edges: [],
  mode: 'mindmap',
  nodes: [{ id: `file:${label}.md`, kind: 'file', label, path: `${label}.md` }],
})

const tempDir = () => path.resolve(process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? '.')

const createLocalHistoryService = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' as const })),
  }) as unknown as LocalHistoryServiceContract

const createApp = (userDataPath: string): App =>
  ({ getPath: vi.fn(() => userDataPath), on: vi.fn(), removeListener: vi.fn() }) as unknown as App

const createShell = (): Shell => ({ openPath: vi.fn(async () => '') }) as unknown as Shell
