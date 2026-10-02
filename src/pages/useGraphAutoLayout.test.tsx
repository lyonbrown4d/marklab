import { act, renderHook, waitFor } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'
import type { Node } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import type { GraphFlowInstance } from '@/pages/graph/graphPageConfig'
import { useGraphAutoLayout } from '@/pages/useGraphAutoLayout'

const layoutGraphWithElk = vi.hoisted(() => vi.fn())

vi.mock('@/logic/graphLayout', () => ({ layoutGraphWithElk }))

const createNode = (x = 0, y = 0): Node<GraphNodeData> => ({
  id: 'heading:first',
  type: 'heading',
  data: { label: 'First' },
  position: { x, y },
})

const graph: GraphData = {
  nodes: [createNode()],
  edges: [],
  layoutKey: 'layout:one',
}

const createDeferredLayouts = () => {
  const resolvers: Array<(nodes: Node<GraphNodeData>[]) => void> = []
  layoutGraphWithElk.mockImplementation(
    () =>
      new Promise<Node<GraphNodeData>[]>((resolve) => {
        resolvers.push(resolve)
      }),
  )
  return resolvers
}

const renderAutoLayout = (initialFlowInstance: GraphFlowInstance) => {
  let currentNodes = graph.nodes
  const setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>> = (next) => {
    currentNodes = typeof next === 'function' ? next(currentNodes) : next
  }
  const callbacks = {
    onUpdateHeadingContent: vi.fn(),
    onUpdateHeadingTitle: vi.fn(),
  }
  const result = renderHook(
    ({ activeGraph, flowInstance }: { activeGraph: GraphData; flowInstance: GraphFlowInstance }) =>
      useGraphAutoLayout({
        contentMode: 'summary',
        editable: true,
        flowInstance,
        graph: activeGraph,
        setNodes,
        ...callbacks,
      }),
    { initialProps: { activeGraph: graph, flowInstance: initialFlowInstance } },
  )
  return {
    ...result,
    getCurrentNodes: () => currentNodes,
    setCurrentNodes: (nodes: Node<GraphNodeData>[]) => {
      currentNodes = nodes
    },
  }
}

describe('useGraphAutoLayout', () => {
  beforeEach(() => {
    layoutGraphWithElk.mockReset()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
  })

  it('restarts a pending initial layout when the flow instance becomes available', async () => {
    const resolvers = createDeferredLayouts()
    const fitView = vi.fn()
    const flowInstance = {
      fitView,
      getNodes: () => result.getCurrentNodes(),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    } as unknown as GraphFlowInstance
    const result = renderAutoLayout(null)

    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(1))
    result.rerender({ activeGraph: graph, flowInstance })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolvers[0]?.([createNode(100, 50)])
      resolvers[1]?.([createNode(200, 100)])
      await Promise.resolve()
    })

    expect(result.getCurrentNodes()[0]?.position).toEqual({ x: 200, y: 100 })
    expect(fitView).toHaveBeenCalledOnce()
  })

  it('does not reset the viewport after interaction during a pending layout', async () => {
    const resolvers = createDeferredLayouts()
    const fitView = vi.fn()
    let viewport = { x: 0, y: 0, zoom: 1 }
    const result = renderAutoLayout(null)
    const flowInstance = {
      fitView,
      getNodes: () => result.getCurrentNodes(),
      getViewport: () => viewport,
    } as unknown as GraphFlowInstance
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(1))
    result.rerender({ activeGraph: graph, flowInstance })

    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))
    result.setCurrentNodes([{ ...createNode(40, 20), dragging: false }])
    viewport = { x: 12, y: 8, zoom: 1.1 }

    await act(async () => {
      resolvers[1]?.([createNode(200, 100)])
      await Promise.resolve()
    })

    expect(result.getCurrentNodes()[0]?.position).toEqual({ x: 40, y: 20 })
    expect(fitView).not.toHaveBeenCalled()
  })

  it('restarts layout when returning to an applied graph while another graph is pending', async () => {
    const resolvers = createDeferredLayouts()
    const fitView = vi.fn()
    const result = renderAutoLayout(null)
    const flowInstance = {
      fitView,
      getNodes: () => result.getCurrentNodes(),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    } as unknown as GraphFlowInstance

    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(1))
    await act(async () => {
      resolvers[0]?.([createNode(100, 50)])
      await Promise.resolve()
    })

    const graphB = { ...graph, layoutKey: 'layout:two' }
    result.rerender({ activeGraph: graphB, flowInstance })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))

    result.rerender({ activeGraph: graph, flowInstance })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(3))
    await act(async () => {
      resolvers[2]?.([createNode(300, 150)])
      await Promise.resolve()
    })

    expect(result.getCurrentNodes()[0]?.position).toEqual({ x: 300, y: 150 })
  })

  it('aborts a superseded layout run without logging the expected cancellation', async () => {
    let firstSignal: AbortSignal | undefined
    layoutGraphWithElk
      .mockImplementationOnce(
        (
          _nodes: Node<GraphNodeData>[],
          _edges: GraphData['edges'],
          options?: { signal?: AbortSignal },
        ) =>
          new Promise<Node<GraphNodeData>[]>((_resolve, reject) => {
            firstSignal = options?.signal
            firstSignal?.addEventListener(
              'abort',
              () => reject(new DOMException('Graph layout was cancelled.', 'AbortError')),
              { once: true },
            )
          }),
      )
      .mockImplementationOnce(async (nodes: Node<GraphNodeData>[]) => nodes)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = renderAutoLayout(null)

    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledOnce())
    result.rerender({
      activeGraph: { ...graph, layoutKey: 'layout:two' },
      flowInstance: null,
    })

    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)
    expect(layoutGraphWithElk.mock.calls[1]?.[2]?.signal).toBeInstanceOf(AbortSignal)
    await act(async () => Promise.resolve())
    expect(warn).not.toHaveBeenCalled()
  })

  it('still logs genuine layout failures', async () => {
    const error = new Error('ELK failed')
    layoutGraphWithElk.mockRejectedValueOnce(error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    renderAutoLayout(null)

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Failed to apply ELK graph layout', error),
    )
  })
})
