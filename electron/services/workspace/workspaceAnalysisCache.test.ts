import { describe, expect, it, vi } from 'vitest'

import { WorkspaceAnalysisCache } from '@electron/services/workspace/workspaceAnalysisCache'
import type { FsGraph, FsWorkspaceIndex } from '@electron/services/workspace/types'

const input = {
  documents: [{ path: 'note.md', content: '# Note' }],
  knownPaths: { paths: ['note.md'], assetPaths: [] },
}

const index: FsWorkspaceIndex = { files: [], paths: ['note.md'], asset_paths: [] }
const graph: FsGraph = { edges: [], mode: 'mindmap', nodes: [] }

describe('WorkspaceAnalysisCache', () => {
  it('exposes a stable revision that advances on invalidation', () => {
    const cache = new WorkspaceAnalysisCache()

    expect(cache.revision).toBe(0)
    expect(cache.revision).toBe(0)
    cache.invalidate()
    expect(cache.revision).toBe(1)
  })

  it('shares analysis input and result promises within one generation', async () => {
    const cache = new WorkspaceAnalysisCache()
    const loadInput = vi.fn(async () => input)
    const loadIndex = vi.fn(async () => index)
    const loadGraph = vi.fn(async () => graph)

    const [firstInput, secondInput] = await Promise.all([
      cache.getInput(loadInput),
      cache.getInput(loadInput),
    ])
    const [firstIndex, secondIndex, firstGraph, secondGraph] = await Promise.all([
      cache.getIndex(loadIndex),
      cache.getIndex(loadIndex),
      cache.getGraph(loadGraph),
      cache.getGraph(loadGraph),
    ])

    expect(firstInput).toBe(secondInput)
    expect(firstIndex).toBe(secondIndex)
    expect(firstGraph).toBe(secondGraph)
    expect(loadInput).toHaveBeenCalledOnce()
    expect(loadIndex).toHaveBeenCalledOnce()
    expect(loadGraph).toHaveBeenCalledOnce()
  })

  it('invalidates every cached stage together', async () => {
    const cache = new WorkspaceAnalysisCache()
    const loadInput = vi.fn(async () => input)
    const loadIndex = vi.fn(async () => index)
    const loadGraph = vi.fn(async () => graph)

    await Promise.all([
      cache.getInput(loadInput),
      cache.getIndex(loadIndex),
      cache.getGraph(loadGraph),
    ])
    cache.invalidate()
    await Promise.all([
      cache.getInput(loadInput),
      cache.getIndex(loadIndex),
      cache.getGraph(loadGraph),
    ])

    expect(loadInput).toHaveBeenCalledTimes(2)
    expect(loadIndex).toHaveBeenCalledTimes(2)
    expect(loadGraph).toHaveBeenCalledTimes(2)
  })

  it('does not retain a failed request', async () => {
    const cache = new WorkspaceAnalysisCache()
    const loadGraph = vi
      .fn<() => Promise<FsGraph>>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(graph)

    await expect(cache.getGraph(loadGraph)).rejects.toThrow('failed')
    await expect(cache.getGraph(loadGraph)).resolves.toBe(graph)
    expect(loadGraph).toHaveBeenCalledTimes(2)
  })
})
