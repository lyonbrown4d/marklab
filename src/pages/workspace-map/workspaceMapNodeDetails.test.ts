import { describe, expect, it } from 'vitest'
import {
  collectVisibleWorkspaceMapFileNodeIds,
  createWorkspaceMapNodeDetailsMerger,
} from '@/pages/workspace-map/workspaceMapNodeDetails'
import type { GraphData } from '@/logic/graph'
import type { WorkspaceGraphNodeDetailsResult } from '@/services/fsApi'

const graph: GraphData = {
  nodes: Array.from({ length: 1_000 }, (_, index) => ({
    id: `file:${index}.md`,
    type: 'file',
    data: { label: `${index}`, contentMode: 'full' },
    position: { x: index, y: 0 },
  })),
  edges: [],
  layoutKey: 'topology',
}
const detail = (index: number): WorkspaceGraphNodeDetailsResult['items'][number] => ({
  id: `file:${index}.md`,
  content: `Content ${index}`,
  content_blocks: [{ id: `${index}:p`, kind: 'paragraph', text: `Content ${index}` }],
  preview: { html: `<p>Content ${index}</p>`, math: [] },
})

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

    const merged = createWorkspaceMapNodeDetailsMerger()(graph, [
      {
        id: 'file:a.md',
        content: 'Summary',
        content_blocks: [],
        preview: { html: '<p>Summary</p>', math: [] },
      },
    ])

    expect(merged.nodes[0]).toMatchObject({
      id: 'file:a.md',
      position: { x: 10, y: 20 },
      data: {
        content: 'Summary',
        contentBlocks: [],
        preview: { html: '<p>Summary</p>', math: [] },
      },
    })
    expect(merged.edges).toBe(graph.edges)
    expect(merged.layoutKey).toBe('topology')
  })

  it('updates only the changed preview when a visible batch is fetched again', () => {
    const merge = createWorkspaceMapNodeDetailsMerger()
    const details = Array.from({ length: 32 }, (_, index) => detail(index))
    const first = merge(graph, details)
    const refreshed = structuredClone(details)
    refreshed[0]!.content = 'Changed'
    const next = merge(graph, refreshed)

    expect(next.nodes.filter((node, index) => node !== first.nodes[index])).toHaveLength(1)
    expect(next.nodes[0]?.data.content).toBe('Changed')
    expect(next.nodes[1]?.data.contentBlocks).toBe(first.nodes[1]?.data.contentBlocks)
    expect(next.nodes[1]?.data.preview).toBe(first.nodes[1]?.data.preview)
    expect(next.edges).toBe(graph.edges)
  })

  it('retains overlapping previews but evicts details outside the latest visible batch', () => {
    const merge = createWorkspaceMapNodeDetailsMerger()
    const first = merge(graph, [detail(0), detail(1)])
    const next = merge(graph, [detail(1), detail(2)])
    expect(next.nodes[0]).toBe(graph.nodes[0])
    expect(next.nodes[1]).toBe(first.nodes[1])
    expect(next.nodes[2]?.data.content).toBe('Content 2')

    const returned = merge(graph, [detail(0), detail(1)])
    expect(returned.nodes[0]).not.toBe(first.nodes[0])
    expect(returned.nodes[1]).toBe(next.nodes[1])
    expect(merge(graph, [])).toBe(graph)
    expect(merge(graph, [detail(1)]).nodes[1]).not.toBe(returned.nodes[1])
  })

  it('preserves new source geometry and refreshed preview data without mutating its inputs', () => {
    const merge = createWorkspaceMapNodeDetailsMerger()
    const first = merge(graph, [detail(0)])
    const moved: GraphData = {
      ...graph,
      nodes: graph.nodes.map((node, index) =>
        index === 0 ? { ...node, position: { x: 100, y: 200 } } : node,
      ),
    }
    const next = merge(moved, [detail(0)])
    expect(next.nodes[0]?.position).toEqual({ x: 100, y: 200 })
    expect(next.nodes[0]?.data.contentBlocks).toBe(first.nodes[0]?.data.contentBlocks)
    expect(moved.nodes[0]?.data.content).toBeUndefined()

    const refreshed = { ...detail(0), content_blocks: [], preview: { html: '', math: [] } }
    const cleared = merge(moved, [refreshed])
    expect(cleared.nodes[0]?.data.contentBlocks).toEqual([])
    expect(cleared.nodes[0]?.data.preview).toEqual({ html: '', math: [] })
    expect(first.nodes[0]?.data.preview?.html).toBe('<p>Content 0</p>')
  })
})
