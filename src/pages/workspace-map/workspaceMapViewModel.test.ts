import { describe, expect, it } from 'vitest'
import type { GraphData } from '@/logic/graph'
import {
  createWorkspaceMapViewGraph,
  getWorkspaceMapInitialFocusPath,
  shouldCompactWorkspaceMap,
} from '@/pages/workspace-map/workspaceMapViewModel'

const graph: GraphData = {
  nodes: [
    {
      id: 'file:notes/a.md',
      type: 'file',
      data: { label: 'A', path: 'notes/a.md' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'file:docs/Home.md',
      type: 'file',
      data: { label: 'Home', path: 'docs/Home.md' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'ext:https://example.com',
      type: 'external',
      data: { label: 'Example', url: 'https://example.com' },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [
    { id: 'internal', source: 'file:notes/a.md', target: 'file:docs/Home.md' },
    { id: 'external', source: 'file:notes/a.md', target: 'ext:https://example.com' },
  ],
  layoutKey: 'map',
}

describe('workspaceMapViewModel', () => {
  it('filters external nodes and their edges without mutating the source graph', () => {
    const result = createWorkspaceMapViewGraph(graph, false)

    expect(result.totalExternalCount).toBe(1)
    expect(result.graph.nodes.map((node) => node.id)).toEqual([
      'file:notes/a.md',
      'file:docs/Home.md',
    ])
    expect(result.graph.edges.map((edge) => edge.id)).toEqual(['internal'])
    expect(graph.nodes).toHaveLength(3)
  })

  it('prefers Home.md and otherwise chooses the most connected internal file', () => {
    expect(getWorkspaceMapInitialFocusPath(graph)).toBe('docs/Home.md')
    expect(
      getWorkspaceMapInitialFocusPath({
        ...graph,
        nodes: graph.nodes.filter((node) => node.id !== 'file:docs/Home.md'),
        edges: [],
      }),
    ).toBe('notes/a.md')
  })

  it('compacts only maps at or above the rich-node threshold', () => {
    expect(shouldCompactWorkspaceMap(graph.nodes)).toBe(false)
    expect(
      shouldCompactWorkspaceMap(
        Array.from({ length: 12 }, (_, index) => ({
          id: `file:${index}.md`,
          type: 'file',
          data: { label: `${index}`, path: `${index}.md` },
          position: { x: 0, y: 0 },
        })),
      ),
    ).toBe(true)
  })
})
