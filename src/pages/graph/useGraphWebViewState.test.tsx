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
    view.rerender({ layoutKey: 'layout-a' })
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

  it('updates only affected nodes when editing and switching web views in a large graph', () => {
    const nodes: Node<GraphNodeData>[] = Array.from({ length: 1_000 }, (_, index) =>
      index < 400
        ? externalNode(`web-${index}`)
        : {
            id: `file-${index}`,
            type: index < 800 ? 'preview' : 'file',
            position: { x: 0, y: 0 },
            data: { label: `File ${index}`, target: `${index}.pdf` },
          },
    )
    const { result, rerender } = renderHook(
      ({ nodes }) => useGraphRenderedNodes(nodes, 'layout-a'),
      { initialProps: { nodes } },
    )
    let previous = result.current.renderedNodes
    const edited = nodes.map((node, index) =>
      index === 800 ? { ...node, data: { ...node.data, content: 'Edited' } } : node,
    )
    rerender({ nodes: edited })
    expect(
      result.current.renderedNodes.filter((node, index) => node !== previous[index]),
    ).toHaveLength(1)
    expect(result.current.renderedNodes[800]?.data.content).toBe('Edited')

    previous = result.current.renderedNodes
    act(() => result.current.activate('web-0'))
    expect(
      result.current.renderedNodes.filter((node, index) => node !== previous[index]),
    ).toHaveLength(1)
    expect(result.current.renderedNodes[0]?.data.webView?.active).toBe(true)

    previous = result.current.renderedNodes
    act(() => result.current.activate('web-1'))
    expect(
      result.current.renderedNodes.filter((node, index) => node !== previous[index]),
    ).toHaveLength(2)
    expect(result.current.renderedNodes[0]?.data.webView?.active).toBe(false)
    expect(result.current.renderedNodes[1]?.data.webView?.active).toBe(true)

    previous = result.current.renderedNodes
    act(() => result.current.deactivate())
    expect(
      result.current.renderedNodes.filter((node, index) => node !== previous[index]),
    ).toHaveLength(1)
  })

  it('keeps activation callbacks stable while checking the latest node URL', () => {
    const { result, rerender } = renderHook(
      ({ nodes }) => useGraphRenderedNodes(nodes, 'layout-a'),
      { initialProps: { nodes: [externalNode('one')] } },
    )
    const activate = result.current.renderedNodes[0]!.data.webView!.activate
    rerender({
      nodes: [{ ...externalNode('one'), data: { label: 'Blocked', url: 'http://example.com' } }],
    })
    expect(result.current.activate).toBe(activate)
    act(() => activate('one'))
    expect(result.current.activeNodeId).toBeNull()
    expect(result.current.renderedNodes[0]?.data.webView).toBeUndefined()

    rerender({ nodes: [externalNode('one')] })
    act(() => activate('one'))
    expect(result.current.activeNodeId).toBe('one')
  })

  it('ignores activation from a retired graph and updates current preview content', () => {
    const nodes = [externalNode('one')]
    const { result, rerender } = renderHook(
      ({ layoutKey, nodes }) => useGraphRenderedNodes(nodes, layoutKey),
      { initialProps: { layoutKey: 'layout-a', nodes } },
    )
    const retiredActivate = result.current.activate
    rerender({ layoutKey: 'layout-b', nodes })
    act(() => retiredActivate('one'))
    expect(result.current.activeNodeId).toBeNull()
    act(() => result.current.activate('one'))
    expect(result.current.activeNodeId).toBe('one')

    const updated = {
      ...nodes[0]!,
      position: { x: 20, y: 40 },
      data: { label: 'Updated', url: 'https://updated.example.com/' },
    }
    rerender({ layoutKey: 'layout-b', nodes: [updated] })
    expect(result.current.renderedNodes[0]).toMatchObject(updated)
    expect(result.current.renderedNodes[0]?.data.webView?.active).toBe(true)
    expect(updated.data).not.toHaveProperty('webView')
  })
})
