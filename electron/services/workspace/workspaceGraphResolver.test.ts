import { describe, expect, it, vi } from 'vitest'

import { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import { WorkspaceGraphResolver } from '@electron/services/workspace/workspaceGraphResolver'
import type { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'
import type { FsGraph } from '@electron/services/workspace/types'

describe('WorkspaceGraphResolver', () => {
  it('does not let an older concurrent revision overwrite the newest persistent graph', async () => {
    const scheduler = new WorkspaceGraphComputationScheduler({ concurrency: 2 })
    const store = {
      get: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    } as unknown as WorkspaceGraphStore
    const resolver = new WorkspaceGraphResolver({
      logger: { warn: vi.fn() },
      scheduler,
      store,
    })
    let releaseOld!: (value: FsGraph) => void
    const oldBuild = vi.fn(() => new Promise<FsGraph>((resolve) => (releaseOld = resolve)))
    const oldRequest = resolver.resolve(input('# Old', oldBuild))
    await vi.waitFor(() => expect(oldBuild).toHaveBeenCalledOnce())

    const newest = graph('new')
    const newRequest = resolver.resolve(input('# New', async () => newest))
    await expect(newRequest).resolves.toEqual({
      ...newest,
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    releaseOld(graph('old'))
    await oldRequest

    expect(store.save).toHaveBeenCalledOnce()
    expect(store.save).toHaveBeenCalledWith(
      'external:C:/notes',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      newest,
    )
  })
})

const input = (content: string, build: () => Promise<FsGraph>) => ({
  build,
  documents: [{ content, path: 'alpha.md' }],
  knownPaths: { assetPaths: [], paths: ['alpha.md'] },
  priority: 'background' as const,
  workspaceKey: 'external:C:/notes',
})

const graph = (label: string): FsGraph => ({
  edges: [],
  mode: 'mindmap',
  nodes: [{ id: `file:${label}.md`, kind: 'file', label, path: `${label}.md` }],
})
