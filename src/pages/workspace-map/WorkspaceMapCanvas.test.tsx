import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  useEffect,
  useState,
  type Dispatch,
  type KeyboardEventHandler,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMapCanvas } from '@/pages/workspace-map/WorkspaceMapCanvas'
import type { GraphData, GraphNodeData } from '@/logic/graph'

type FlowProps = {
  elementsSelectable: boolean
  nodes: GraphData['nodes']
  nodesDraggable: boolean
  nodesFocusable: boolean
  onlyRenderVisibleElements: boolean
  onInit?: (flow: FlowApi) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onNodeClick?: (event: ReactMouseEvent<HTMLDivElement>, node: GraphData['nodes'][number]) => void
  tabIndex: number
  zoomOnScroll: boolean
}

type FlowApi = {
  fitView: ReturnType<typeof vi.fn>
  zoomIn: ReturnType<typeof vi.fn>
  zoomOut: ReturnType<typeof vi.fn>
}

const flowPropsRef = vi.hoisted(() => ({ current: null as FlowProps | null }))
const layoutStatusRef = vi.hoisted(() => ({ current: 'ready' as 'error' | 'loading' | 'ready' }))
const layoutRetry = vi.hoisted(() => vi.fn())
const layoutArgsRef = vi.hoisted(() => ({
  current: null as null | { activePath: string | null; graph: GraphData },
}))

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => null,
  Handle: () => null,
  MiniMap: () => null,
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
}))

vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/graph/graphMiniMap', () => ({
  getMiniMapNodeColor: () => 'transparent',
  shouldRenderGraphMiniMap: () => false,
}))
vi.mock('@/pages/workspace-map/useWorkspaceMapLayout', () => ({
  useWorkspaceMapLayout: ({
    activePath,
    flow,
    graph,
  }: {
    activePath: string | null
    flow: { fitView: () => Promise<boolean> } | null
    graph: GraphData
  }) => {
    const status = layoutStatusRef.current
    layoutArgsRef.current = { activePath, graph }
    useEffect(() => {
      if (status === 'ready' && flow) void flow.fitView()
    }, [flow, status])
    return { retry: layoutRetry, status }
  },
}))

const graph: GraphData = {
  nodes: [
    {
      id: 'file:notes/a.md',
      type: 'file',
      data: { label: 'A', path: 'notes/a.md' },
      position: { x: 0, y: 0 },
    },
    {
      id: 'file:notes/b.md',
      type: 'file',
      data: { label: 'B', path: 'notes/b.md' },
      position: { x: 240, y: 0 },
    },
    {
      id: 'preview:docs/brief.pdf',
      type: 'preview',
      data: { label: 'brief.pdf', path: 'docs/brief.pdf', previewKind: 'pdf' },
      position: { x: 480, y: 0 },
    },
  ],
  edges: [],
  layoutKey: 'map',
}

const renderCanvas = (activePath: string | null, onActivateEditor = vi.fn()) => {
  const view = render(
    <WorkspaceMapCanvas
      activePath={activePath}
      editorLoadState={{ status: 'ready', content: '# A' }}
      graph={graph}
      onActivateEditor={onActivateEditor}
      onChange={vi.fn()}
      onCloseEditor={vi.fn()}
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
    expect(flowPropsRef.current?.elementsSelectable).toBe(false)
    expect(flowPropsRef.current?.nodes[0]).toMatchObject({
      ariaLabel: 'A',
      ariaRole: 'button',
      focusable: true,
      draggable: true,
    })
    expect(flowPropsRef.current?.nodes[2]).toMatchObject({
      ariaRole: 'group',
      dragHandle: '.workspace-map-pdf-drag-handle',
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
    expect(editorNodes?.[0].draggable).toBe(false)
    expect(flowPropsRef.current?.nodes[1]?.draggable).toBe(true)
    expect(layoutArgsRef.current?.graph.layoutKey).toBe('map')
    expect(layoutArgsRef.current?.activePath).toBeNull()
  })

  it('activates the clicked file node and presents only that node as the editor', () => {
    const onActivateEditor = vi.fn()
    const { rerender } = renderCanvas(null, onActivateEditor).view
    const node = document.querySelector<HTMLElement>('[data-id="file:notes/a.md"]')

    expect(node).not.toBeNull()
    fireEvent.click(node!)
    expect(onActivateEditor).toHaveBeenCalledWith('notes/a.md')

    rerender(
      <WorkspaceMapCanvas
        activePath="notes/a.md"
        editorLoadState={{ status: 'ready', content: '# A' }}
        graph={graph}
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
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledWith({ maxZoom: 1 }))
    flow.fitView.mockClear()

    const canvas = screen.getByTestId('flow')
    fireEvent.keyDown(canvas, { key: '+' })
    fireEvent.keyDown(canvas, { ctrlKey: true, key: '=' })
    fireEvent.keyDown(canvas, { key: '-' })
    fireEvent.keyDown(canvas, { key: '0' })

    expect(flow.zoomIn).toHaveBeenCalledTimes(2)
    expect(flow.zoomOut).toHaveBeenCalledOnce()
    expect(flow.fitView).toHaveBeenCalledWith({ duration: 0, maxZoom: 1, padding: 0.22 })
    expect(flowPropsRef.current?.tabIndex).toBe(0)
    expect(flowPropsRef.current?.zoomOnScroll).toBe(true)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'file:notes/a.md child' }), {
      key: '+',
    })
    expect(flow.zoomIn).toHaveBeenCalledTimes(2)

    flow.fitView.mockClear()
    fireEvent(window, new Event('resize'))
    await waitFor(() =>
      expect(flow.fitView).toHaveBeenCalledWith({ duration: 0, maxZoom: 1, padding: 0.22 }),
    )
  })
})
