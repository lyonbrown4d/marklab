import { describe, expect, it } from 'vitest'
import {
  collectVisibleWorkspaceMapFileNodeIds,
  mergeWorkspaceMapNodeDetails,
} from '@/pages/workspace-map/workspaceMapNodeDetails'
import type { GraphData } from '@/logic/graph'

describe('workspace map node details', () => {
  it('prioritizes the active file and bounds rendered file nodes', () => {
    const container = document.createElement('div')
    container.innerHTML = [
      '<div class="react-flow__node" data-id="file:visible-a.md"></div>',
      '<div class="react-flow__node" data-id="preview:image.png"></div>',
      '<div class="react-flow__node" data-id="file:visible-b.md"></div>',
    ].join('')

    expect(collectVisibleWorkspaceMapFileNodeIds(container, 'active.md', 2)).toEqual([
      'file:active.md',
      'file:visible-a.md',
    ])
  })

  it('merges details without mutating graph topology', () => {
    const graph: GraphData = {
      nodes: [
        {
          id: 'file:a.md',
          type: 'file',
          data: { label: 'a', contentMode: 'summary' },
          position: { x: 10, y: 20 },
        },
      ],
      edges: [{ id: 'edge', source: 'file:a.md', target: 'file:b.md' }],
      layoutKey: 'topology',
    }

    const merged = mergeWorkspaceMapNodeDetails(graph, [
      { id: 'file:a.md', content: 'Summary', content_blocks: [] },
    ])

    expect(merged.nodes[0]).toMatchObject({
      id: 'file:a.md',
      position: { x: 10, y: 20 },
      data: { content: 'Summary', contentBlocks: [] },
    })
    expect(merged.edges).toBe(graph.edges)
    expect(merged.layoutKey).toBe('topology')
  })
})
