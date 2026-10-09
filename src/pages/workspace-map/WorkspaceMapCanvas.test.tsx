import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMapCanvas } from '@/pages/workspace-map/WorkspaceMapCanvas'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import type {
  WorkspaceMapFlowApi as FlowApi,
  WorkspaceMapFlowProps as FlowProps,
} from '@/pages/workspace-map/WorkspaceMapCanvas.testContracts'
import { workspaceMapTestGraph as graph } from '@/pages/workspace-map/workspaceMapTestGraph'

const flowPropsRef = vi.hoisted(() => ({ current: null as FlowProps | null }))
const layoutStatusRef = vi.hoisted(() => ({ current: 'ready' as 'error' | 'loading' | 'ready' }))
const layoutRetry = vi.hoisted(() => vi.fn())
const closeEditor = vi.hoisted(() => vi.fn())
const layoutArgsRef = vi.hoisted(() => ({
  current: null as null | { activePath: string | null; focusPath: string | null; graph: GraphData },
}))

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
  PanOnScrollMode: { Free: 'free' },
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: (props: FlowProps) => {
    flowPropsRef.current = props
    return (
      <div data-testid="flow" onKeyDown={props.onKeyDown}>
        {props.nodes.map((node) => (
          <div
            className="react-flow__node"
            data-id={node.id}
            key={node.id}
            tabIndex={0}
            onClick={(event) => props.onNodeClick?.(event, node)}
          >
            <input aria-label={`${node.id} child`} />
          </div>
        ))}
      </div>
    )
  },
  useEdgesState: <T,>(initial: T[]) => {
    const [value, setValue] = useState(initial)
    return [value, setValue, vi.fn()] as const
  },
  useNodesState: <T,>(initial: T[]) => {
    const [value, setValue] = useState(initial)
    return [value, setValue as Dispatch<SetStateAction<T[]>>, vi.fn()] as const
  },
  useStore: (selector: (state: { width: number }) => unknown) => selector({ width: 1_000 }),
}))

vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/pages/workspace-map/useWorkspaceMapNodeDetails', () => ({
  useWorkspaceMapNodeDetails: ({ graph }: { graph: GraphData }) => graph,
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/graph/graphMiniMap', () => ({
  getMiniMapNodeColor: () => 'transparent',
  shouldRenderGraphMiniMap: () => false,
}))
vi.mock('@/pages/workspace-map/useWorkspaceMapLayout', () => ({
  useWorkspaceMapLayout: ({
    activePath,
    flow,
    focusPath,
    graph,
  }: {
    activePath: string | null
    flow: { fitView: () => Promise<boolean> } | null
    focusPath: string | null
    graph: GraphData
  }) => {
    const status = layoutStatusRef.current
    layoutArgsRef.current = { activePath, focusPath, graph }
    useEffect(() => {
      if (status === 'ready' && flow) void flow.fitView()
    }, [flow, status])
    return { retry: layoutRetry, status }
  },
}))

const renderCanvas = (activePath: string | null, onActivateEditor = vi.fn()) => {
  const view = render(
    <WorkspaceMapCanvas
      activePath={activePath}
      editorLoadState={{ status: 'ready', content: '# A' }}
      graph={graph}
      graphIdentity="workspace:test"
      onActivateEditor={onActivateEditor}
      onChange={vi.fn()}
      onCloseEditor={closeEditor}
      onOpenFile={vi.fn()}
      onRetryEditor={vi.fn()}
      readOnly={false}
      showMiniMap={false}
    />,
  )
  return { onActivateEditor, view }
}

describe('WorkspaceMapCanvas', () => {
  beforeEach(() => {
    flowPropsRef.current = null
    layoutStatusRef.current = 'ready'
    layoutRetry.mockClear()
    closeEditor.mockClear()
    layoutArgsRef.current = null
  })

  it('keeps raw nodes hidden behind explicit layout loading and error states', () => {
    layoutStatusRef.current = 'loading'
    const { rerender } = renderCanvas(null).view

    expect(screen.getByText('workspaceMap.loadingDocument')).toBeInTheDocument()
    expect(screen.queryByTestId('flow')).not.toBeInTheDocument()

    layoutStatusRef.current = 'error'
    rerender(
      <WorkspaceMapCanvas
        activePath={null}
        editorLoadState={{ status: 'ready', content: '# A' }}
        graph={graph}
        graphIdentity="workspace:test"
        onActivateEditor={vi.fn()}
        onChange={vi.fn()}
        onCloseEditor={vi.fn()}
        onOpenFile={vi.fn()}
        onRetryEditor={vi.fn()}
        readOnly={false}
        showMiniMap={false}
      />,
    )

    expect(screen.getByText('workspaceMap.loadFailed')).toBeInTheDocument()
    expect(screen.queryByTestId('flow')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.retry' }))
    expect(layoutRetry).toHaveBeenCalledOnce()
  })

  it('virtualizes nodes and exposes actionable nodes to keyboard users', () => {
    const { onActivateEditor } = renderCanvas(null)
    const node = document.querySelector<HTMLElement>('[data-id="file:notes/a.md"]')

    expect(flowPropsRef.current?.onlyRenderVisibleElements).toBe(true)
    expect(flowPropsRef.current?.nodesFocusable).toBe(true)
    expect(flowPropsRef.current?.nodesDraggable).toBe(true)
    expect(flowPropsRef.current?.nodeDragThreshold).toBe(4)
    expect(flowPropsRef.current?.elementsSelectable).toBe(false)
    expect(flowPropsRef.current?.nodes[0]).toMatchObject({
      ariaLabel: 'A',
      ariaRole: 'button',
      focusable: true,
      draggable: true,
    })
    expect(flowPropsRef.current?.nodes[0]?.dragHandle).toBeUndefined()
    expect(flowPropsRef.current?.nodes[2]).toMatchObject({
      ariaRole: 'group',
      dragHandle: '.embedded-preview-drag-handle',
      draggable: true,
      focusable: false,
    })
    expect(node).not.toBeNull()

    fireEvent.keyDown(node!, { key: 'Enter' })
    expect(onActivateEditor).toHaveBeenCalledWith('notes/a.md')

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'file:notes/a.md child' }), { key: ' ' })
    expect(onActivateEditor).toHaveBeenCalledOnce()
  })

  it('keeps exactly one editor payload on the active node', () => {
    renderCanvas('notes/a.md')

    const editorNodes = flowPropsRef.current?.nodes.filter((node) =>
      Boolean((node.data as GraphNodeData).workspaceMapEditor),
    )
    expect(editorNodes).toHaveLength(1)
    expect(editorNodes?.[0].focusable).toBe(false)
    expect(editorNodes?.[0].draggable).toBe(true)
    expect(flowPropsRef.current?.nodes[1]?.draggable).toBe(true)
    expect(layoutArgsRef.current?.graph.layoutKey).toBe('map:internal')
    expect(layoutArgsRef.current?.activePath).toBe('notes/a.md')
  })

  it('closes the active editor with Escape from the canvas', () => {
    renderCanvas('notes/a.md')
    fireEvent.keyDown(screen.getByTestId('flow'), { key: 'Escape' })
    expect(closeEditor).toHaveBeenCalledOnce()
  })

  it('activates the clicked file node and presents only that node as the editor', () => {
    const onActivateEditor = vi.fn()
    const { rerender } = renderCanvas(null, onActivateEditor).view
    const node = document.querySelector<HTMLElement>('[data-id="file:notes/a.md"]')

    expect(node).not.toBeNull()
    expect(layoutArgsRef.current).toMatchObject({
      activePath: null,
      focusPath: 'notes/a.md',
    })
    fireEvent.click(node!)
    expect(onActivateEditor).toHaveBeenCalledWith('notes/a.md')

    rerender(
      <WorkspaceMapCanvas
        activePath="notes/a.md"
        editorLoadState={{ status: 'ready', content: '# A' }}
        graph={graph}
        graphIdentity="workspace:test"
        onActivateEditor={onActivateEditor}
        onChange={vi.fn()}
        onCloseEditor={vi.fn()}
        onOpenFile={vi.fn()}
        onRetryEditor={vi.fn()}
        readOnly={false}
        showMiniMap={false}
      />,
    )

    const editorNodes = flowPropsRef.current?.nodes.filter((candidate) =>
      Boolean((candidate.data as GraphNodeData).workspaceMapEditor),
    )
    expect(editorNodes).toHaveLength(1)
    expect(editorNodes?.[0]).toMatchObject({
      id: 'file:notes/a.md',
      focusable: false,
      data: { workspaceMapEditor: { active: true } },
    })
  })

  it('caps initial fit and supports canvas-focused zoom shortcuts', async () => {
    renderCanvas(null)
    const flow: FlowApi = {
      fitView: vi.fn().mockResolvedValue(true),
      zoomIn: vi.fn().mockResolvedValue(true),
      zoomOut: vi.fn().mockResolvedValue(true),
    }

    act(() => flowPropsRef.current?.onInit?.(flow))
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledWith({ maxZoom: 1, minZoom: 0.35 }))
    flow.fitView.mockClear()

    const canvas = screen.getByTestId('flow')
    fireEvent.keyDown(canvas, { key: '+' })
    fireEvent.keyDown(canvas, { ctrlKey: true, key: '=' })
    fireEvent.keyDown(canvas, { key: '-' })
    fireEvent.keyDown(canvas, { key: '0' })

    expect(flow.zoomIn).toHaveBeenCalledTimes(2)
    expect(flow.zoomOut).toHaveBeenCalledOnce()
    expect(flow.fitView).toHaveBeenCalledWith({
      duration: 0,
      maxZoom: 1,
      minZoom: 0.35,
      padding: 0.22,
    })
    expect(flowPropsRef.current?.tabIndex).toBe(0)
    expect(flowPropsRef.current).toMatchObject({
      panOnScroll: true,
      panOnScrollMode: 'free',
      preventScrolling: true,
      zoomOnPinch: true,
      zoomOnScroll: false,
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'file:notes/a.md child' }), {
      key: '+',
    })
    expect(flow.zoomIn).toHaveBeenCalledTimes(2)

    flow.fitView.mockClear()
    fireEvent(window, new Event('resize'))
    expect(flow.fitView).not.toHaveBeenCalled()
  })

  it('opens and focuses node search with Mod+F without consuming Mod+Shift+F', async () => {
    renderCanvas(null)
    const canvas = screen.getByTestId('flow')
    const workspaceFind = createEvent.keyDown(canvas, {
      ctrlKey: true,
      key: 'f',
      shiftKey: true,
    })

    fireEvent(canvas, workspaceFind)
    expect(workspaceFind.defaultPrevented).toBe(false)
    expect(screen.queryByRole('combobox', { name: 'workspaceMap.searchNodes' })).toBeNull()

    fireEvent.keyDown(canvas, { ctrlKey: true, key: 'f' })
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'workspaceMap.searchNodes' })).toHaveFocus(),
    )
  })
})
