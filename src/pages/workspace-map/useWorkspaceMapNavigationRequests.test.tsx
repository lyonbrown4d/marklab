import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { useWorkspaceMapNavigationRequests } from '@/pages/workspace-map/useWorkspaceMapNavigationRequests'
import {
  requestWorkspaceMapNodeFocus,
  workspaceMapNavigationStore,
} from '@/utils/workspaceMapNavigation'

const node = {
  data: { label: 'Home', path: 'notes/Home.md' },
  id: 'file:notes/Home.md',
  position: { x: 0, y: 0 },
  type: 'file',
} satisfies Node<GraphNodeData>

type NavigationFlow = Pick<ReactFlowInstance<Node<GraphNodeData>, Edge>, 'setViewport'>

describe('useWorkspaceMapNavigationRequests', () => {
  beforeEach(() => workspaceMapNavigationStore.setState({ request: null }))

  it('focuses a node by path and restores an exact viewport when supplied', () => {
    const focusNeighborhoodNode = vi.fn()
    const focusNode = vi.fn()
    const fitWorkspace = vi.fn()
    const setViewport = vi.fn().mockResolvedValue(true)
    renderHook(() =>
      useWorkspaceMapNavigationRequests({
        flow: { setViewport },
        fitWorkspace,
        focusNeighborhoodNode,
        focusNode,
        nodes: [node],
        workspaceKey: 'workspace:a',
      }),
    )

    act(() =>
      requestWorkspaceMapNodeFocus({ nodeId: 'notes/Home.md', workspaceKey: 'workspace:a' }),
    )
    expect(focusNode).toHaveBeenCalledExactlyOnceWith(node)

    const viewport = { x: 10, y: 20, zoom: 0.75 }
    act(() =>
      requestWorkspaceMapNodeFocus({ nodeId: node.id, viewport, workspaceKey: 'workspace:a' }),
    )
    expect(focusNeighborhoodNode).toHaveBeenCalledExactlyOnceWith(node.id)
    expect(setViewport).toHaveBeenCalledWith(viewport, { duration: 180 })
    expect(workspaceMapNavigationStore.getState().request).toBeNull()
  })

  it('keeps a request pending until its node and flow are ready', () => {
    requestWorkspaceMapNodeFocus({ nodeId: node.id, workspaceKey: 'workspace:a' })
    const focusNode = vi.fn()
    const focusNeighborhoodNode = vi.fn()
    const fitWorkspace = vi.fn()
    const { rerender } = renderHook(
      ({ flow, nodes }) =>
        useWorkspaceMapNavigationRequests({
          flow,
          fitWorkspace,
          focusNeighborhoodNode,
          focusNode,
          nodes,
          workspaceKey: 'workspace:a',
        }),
      {
        initialProps: {
          flow: null as NavigationFlow | null,
          nodes: [] as Node<GraphNodeData>[],
        },
      },
    )

    expect(workspaceMapNavigationStore.getState().request?.nodeId).toBe(node.id)
    rerender({ flow: { setViewport: vi.fn(async () => true) }, nodes: [node] })

    expect(focusNode).toHaveBeenCalledExactlyOnceWith(node)
    expect(workspaceMapNavigationStore.getState().request).toBeNull()
  })

  it('restores a workspace viewport without waiting for a sentinel node', () => {
    const viewport = { x: 8, y: 16, zoom: 0.65 }
    const setViewport = vi.fn(async () => true)
    requestWorkspaceMapNodeFocus({
      nodeId: 'workspace',
      viewport,
      workspaceKey: 'workspace:a',
    })

    renderHook(() =>
      useWorkspaceMapNavigationRequests({
        fitWorkspace: vi.fn(),
        flow: { setViewport },
        focusNeighborhoodNode: vi.fn(),
        focusNode: vi.fn(),
        nodes: [],
        workspaceKey: 'workspace:a',
      }),
    )

    expect(setViewport).toHaveBeenCalledWith(viewport, { duration: 180 })
    expect(workspaceMapNavigationStore.getState().request).toBeNull()
  })

  it('retains a navigation request while the cached map is inactive', () => {
    requestWorkspaceMapNodeFocus({ nodeId: node.id, workspaceKey: 'workspace:a' })
    const focusNode = vi.fn()
    const props = {
      active: false,
      fitWorkspace: vi.fn(),
      flow: { setViewport: vi.fn(async () => true) },
      focusNeighborhoodNode: vi.fn(),
      focusNode,
      nodes: [node],
      workspaceKey: 'workspace:a',
    }
    const { rerender } = renderHook(
      ({ active }) => useWorkspaceMapNavigationRequests({ ...props, active }),
      { initialProps: { active: false } },
    )

    expect(workspaceMapNavigationStore.getState().request?.nodeId).toBe(node.id)
    rerender({ active: true })

    expect(focusNode).toHaveBeenCalledExactlyOnceWith(node)
    expect(workspaceMapNavigationStore.getState().request).toBeNull()
  })
})
