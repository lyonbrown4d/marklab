import { describe, expect, it } from 'vitest'

import type { FsGraph } from '@electron/services/workspace/types'
import { WorkspaceGraphCache } from '@electron/services/workspace/workspaceGraphCache'

const graph: FsGraph = { edges: [], mode: 'mindmap', nodes: [] }
const knownPaths = (path: string) => ({ paths: [path], assetPaths: [] })

describe('WorkspaceGraphCache', () => {
  it('keys graphs by document content and known file and asset paths', () => {
    const cache = new WorkspaceGraphCache()
    const documents = [{ path: 'alpha.md', content: '# Alpha' }]
    const paths = knownPaths('alpha.md')

    cache.setWorkspaceGraph(documents, paths, graph)

    expect(cache.getWorkspaceGraph(documents, knownPaths('alpha.md'))).toBe(graph)
    expect(
      cache.getWorkspaceGraph([{ path: 'alpha.md', content: '# Changed' }], paths),
    ).toBeUndefined()
    expect(
      cache.getWorkspaceGraph(documents, { paths: ['alpha.md', 'beta.md'], assetPaths: [] }),
    ).toBeUndefined()
    expect(
      cache.getWorkspaceGraph(documents, { paths: ['alpha.md'], assetPaths: ['logo.png'] }),
    ).toBeUndefined()
  })

  it('evicts the least recently used graph when the cache is full', () => {
    const cache = new WorkspaceGraphCache(2)
    const first = [{ path: 'first.md', content: '# First' }]
    const second = [{ path: 'second.md', content: '# Second' }]
    const third = [{ path: 'third.md', content: '# Third' }]

    cache.setWorkspaceGraph(first, knownPaths('first.md'), graph)
    cache.setWorkspaceGraph(second, knownPaths('second.md'), graph)
    expect(cache.getWorkspaceGraph(first, knownPaths('first.md'))).toBe(graph)

    cache.setWorkspaceGraph(third, knownPaths('third.md'), graph)

    expect(cache.getWorkspaceGraph(second, knownPaths('second.md'))).toBeUndefined()
    expect(cache.getWorkspaceGraph(first, knownPaths('first.md'))).toBe(graph)
    expect(cache.getWorkspaceGraph(third, knownPaths('third.md'))).toBe(graph)
  })
})
