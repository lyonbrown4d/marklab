import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { useWorkspaceMapPresentedGraph } from '@/pages/workspace-map/useWorkspaceMapPresentedGraph'

const graph: GraphData = {
  nodes: ['a.md', 'b.md'].map((path) => ({
    id: `file:${path}`,
    type: 'file',
    data: { label: path, path },
    position: { x: 0, y: 0 },
  })),
  edges: [{ id: 'a-b', source: 'file:a.md', target: 'file:b.md' }],
  layoutKey: 'topology',
}

const options = {
  activePath: null,
  editorLoadState: { status: 'ready', content: '' } as const,
  mode: 'overview' as const,
  onChange: vi.fn(),
  onCloseEditor: vi.fn(),
  onOpenFile: vi.fn(),
  onRetryEditor: vi.fn(),
  readOnly: false,
  showExternalResources: false,
}

describe('workspace map presentation identity', () => {
  it('updates fetched details while retaining unrelated cards and edges', () => {
    const { result, rerender } = renderHook(
      ({ graph }) => useWorkspaceMapPresentedGraph({ ...options, graph }),
      { initialProps: { graph } },
    )
    const previous = result.current.renderedGraph
    rerender({
      graph: {
        ...graph,
        nodes: graph.nodes.map((node, index) =>
          index === 0 ? { ...node, data: { ...node.data, content: 'Loaded' } } : node,
        ),
      },
    })

    expect(result.current.renderedGraph.nodes[0]?.data.content).toBe('Loaded')
    expect(result.current.renderedGraph.nodes[1]).toBe(previous.nodes[1])
    expect(result.current.renderedGraph.edges).toBe(previous.edges)
  })

  it('updates mode, editor callbacks, and read-only state without retaining stale options', () => {
    const { result, rerender } = renderHook(
      ({ mode, onChange, readOnly }) =>
        useWorkspaceMapPresentedGraph({
          ...options,
          activePath: 'a.md',
          graph,
          mode,
          onChange,
          readOnly,
        }),
      {
        initialProps: {
          mode: 'overview' as 'overview' | 'focus',
          onChange: options.onChange,
          readOnly: false,
        },
      },
    )
    const onChange = vi.fn()
    rerender({ mode: 'focus', onChange, readOnly: true })

    const editor = result.current.renderedGraph.nodes[0]?.data.workspaceMapEditor
    editor?.onChange('Changed')
    expect(onChange).toHaveBeenCalledWith('Changed')
    expect(editor?.readOnly).toBe(true)
    expect(result.current.renderedGraph.nodes[1]?.data.workspaceMapMode).toBe('focus')
    expect(result.current.renderedGraph.edges[0]?.type).toBe('smoothstep')
  })
})
