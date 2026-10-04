import { act, renderHook } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import type { GraphNodeData } from '@/logic/graph'
import { useGraphRenderedNodes, useGraphWebViewState } from '@/pages/graph/useGraphWebViewState'

const externalNode = (id: string): Node<GraphNodeData> => ({
  data: { label: id, url: `https://${id}.example.com` },
  id,
  position: { x: 0, y: 0 },
  type: 'external',
})

describe('useGraphWebViewState', () => {
  it('keeps exactly one live node and closes it when the graph revision changes', () => {
    const nodes = [externalNode('one'), externalNode('two')]
    const view = renderHook(({ layoutKey }) => useGraphWebViewState(nodes, layoutKey), {
      initialProps: { layoutKey: 'layout-a' },
    })

    act(() => view.result.current.activate('one'))
    expect(view.result.current.activeNodeId).toBe('one')
    act(() => view.result.current.activate('two'))
    expect(view.result.current.activeNodeId).toBe('two')

    view.rerender({ layoutKey: 'layout-b' })
    expect(view.result.current.activeNodeId).toBeNull()
  })

  it('closes a live node that is no longer present', () => {
    const view = renderHook(({ nodes }) => useGraphWebViewState(nodes, 'layout-a'), {
      initialProps: { nodes: [externalNode('one')] },
    })

    act(() => view.result.current.activate('one'))
    view.rerender({ nodes: [] })

    expect(view.result.current.activeNodeId).toBeNull()
  })

  it('keeps the live node when React Flow replaces an equivalent node array', () => {
    const view = renderHook(({ nodes }) => useGraphWebViewState(nodes, 'layout-a'), {
      initialProps: { nodes: [externalNode('one')] },
    })

    act(() => view.result.current.activate('one'))
    view.rerender({ nodes: [externalNode('one')] })

    expect(view.result.current.activeNodeId).toBe('one')
  })

  it('does not activate URLs that the native web surface cannot navigate', () => {
    const insecureNode = {
      ...externalNode('insecure'),
      data: { label: 'Insecure', url: 'http://example.com/' },
    }
    const nodes = [insecureNode]
    const view = renderHook(() => useGraphWebViewState(nodes, 'layout-a'))

    act(() => view.result.current.activate('insecure'))

    expect(view.result.current.activeNodeId).toBeNull()
  })

  it('marks file previews as resizable only when preparing knowledge graph nodes', () => {
    const preview: Node<GraphNodeData> = {
      data: { label: 'Guide', target: 'guide.pdf' },
      id: 'preview:guide.pdf',
      position: { x: 0, y: 0 },
      type: 'preview',
    }
    const view = renderHook(() => useGraphRenderedNodes([preview], 'layout-a'))

    expect(view.result.current.renderedNodes[0]?.data.graphResizable).toBe(true)
    expect(preview.data.graphResizable).toBeUndefined()
  })
})
