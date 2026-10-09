import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type Dispatch, type FocusEventHandler, type SetStateAction } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import { WorkspaceMapCanvas } from '@/pages/workspace-map/WorkspaceMapCanvas'
import { createWorkspaceMapProductTestGraph } from '@/pages/workspace-map/workspaceMapProductTestGraph'

type FlowProps = {
  minZoom: number
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  onInit?: (flow: FlowApi) => void
  onFocusCapture?: FocusEventHandler<HTMLDivElement>
  onNodeMouseEnter?: (event: MouseEvent, node: Node<GraphNodeData>) => void
  onNodeMouseLeave?: (event: MouseEvent, node: Node<GraphNodeData>) => void
  onPaneClick?: () => void
  children?: React.ReactNode
}

type FlowApi = {
  fitView: ReturnType<typeof vi.fn>
  getViewport: ReturnType<typeof vi.fn>
  setViewport: ReturnType<typeof vi.fn>
  zoomIn: ReturnType<typeof vi.fn>
  zoomOut: ReturnType<typeof vi.fn>
}
const flowPropsRef = vi.hoisted(() => ({ current: null as FlowProps | null }))
const layoutGraphRef = vi.hoisted(() => ({ current: null as GraphData | null }))

vi.mock('@/pages/workspace-map/useWorkspaceMapNodeDetails', () => ({
  useWorkspaceMapNodeDetails: ({ graph }: { graph: GraphData }) => graph,
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
      <div data-testid="flow" onFocusCapture={props.onFocusCapture}>
        {props.children}
        {props.nodes.map((node) => (
          <button
            className="react-flow__node"
            data-id={node.id}
            data-testid={`flow-node-${node.id}`}
            key={node.id}
            onMouseEnter={(event) => props.onNodeMouseEnter?.(event.nativeEvent, node)}
            onMouseLeave={(event) => props.onNodeMouseLeave?.(event.nativeEvent, node)}
          >
            {node.data.label}
          </button>
        ))}
      </div>
    )
  },
  ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/graph/graphMiniMap', () => ({
  getMiniMapNodeColor: () => 'transparent',
  shouldRenderGraphMiniMap: () => false,
}))
vi.mock('@/pages/workspace-map/useWorkspaceMapLayout', () => ({
  useWorkspaceMapLayout: ({ graph }: { graph: GraphData }) => {
    layoutGraphRef.current = graph
    return { retry: vi.fn(), status: 'ready' }
  },
}))

const renderCanvas = (activePath: string | null = null, graphIdentity = 'workspace:a') =>
  render(
    <WorkspaceMapCanvas
      activePath={activePath}
      editorLoadState={{ status: 'ready', content: '# Home' }}
      graph={createWorkspaceMapProductTestGraph()}
      graphIdentity={graphIdentity}
      onActivateEditor={vi.fn()}
      onChange={vi.fn()}
      onCloseEditor={vi.fn()}
      onOpenFile={vi.fn()}
      onRetryEditor={vi.fn()}
      readOnly={false}
      showMiniMap={false}
    />,
  )

describe('WorkspaceMapCanvas product readiness', () => {
  beforeEach(() => {
    flowPropsRef.current = null
    layoutGraphRef.current = null
  })

  it('defaults large maps to compact internal topology and makes external resources opt-in', async () => {
    renderCanvas()

    await waitFor(() => expect(flowPropsRef.current?.nodes).toHaveLength(14))
    expect(flowPropsRef.current?.nodes.every((node) => node.width === 248)).toBe(true)
    expect(flowPropsRef.current?.nodes.every((node) => node.height === 112)).toBe(true)
    expect(flowPropsRef.current?.edges).toHaveLength(1)
    expect(layoutGraphRef.current?.nodes).toHaveLength(14)
    expect(
      screen.getByRole('button', { name: 'workspaceMap.showExternalResources' }),
    ).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.showExternalResources' }))

    await waitFor(() => expect(flowPropsRef.current?.nodes).toHaveLength(15))
    expect(flowPropsRef.current?.edges).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'workspaceMap.hideExternalResources' })).toBeVisible()

    const external = flowPropsRef.current?.nodes.find((node) => node.type === 'external')
    expect(external?.data).toMatchObject({
      url: 'https://example.com/docs',
      webView: { active: false },
    })
    act(() => external?.data.webView?.activate(external.id))
    await waitFor(() => {
      const current = flowPropsRef.current?.nodes.find((node) => node.id === external?.id)
      expect(current?.data.webView?.active).toBe(true)
    })
    act(() => flowPropsRef.current?.onPaneClick?.())
    await waitFor(() => {
      const current = flowPropsRef.current?.nodes.find((node) => node.id === external?.id)
      expect(current?.data.webView?.active).toBe(false)
    })
  })

  it('renders AST-derived semantic groups as canvas backgrounds', async () => {
    renderCanvas()

    const documentation = await screen.findByTestId('workspace-map-group-documentation')
    expect(documentation).toHaveTextContent('Documentation')
    expect(documentation.style.left).toMatch(/px$/)
    expect(documentation.style.top).toMatch(/px$/)
    expect(documentation.style.transform).toBe('')
    expect(screen.getByTestId('workspace-map-group-libraries')).toHaveTextContent('Libraries')
  })

  it('focuses a searched node at a readable zoom and keeps the canvas minimum readable', async () => {
    renderCanvas()
    const flow: FlowApi = {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport: vi.fn().mockResolvedValue(true),
      zoomIn: vi.fn().mockResolvedValue(true),
      zoomOut: vi.fn().mockResolvedValue(true),
    }
    act(() => flowPropsRef.current?.onInit?.(flow))

    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.searchNodes' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'workspaceMap.searchNodes' }), {
      target: { value: 'Note 12' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Note 12/ }))

    expect(flowPropsRef.current?.minZoom).toBe(0.35)
    expect(flow.fitView).toHaveBeenCalledWith(
      expect.objectContaining({
        maxZoom: 1,
        minZoom: 0.35,
        nodes: [expect.objectContaining({ id: 'file:notes/note-12.md' })],
      }),
    )
  })

  it('resets opted-in external resources when the workspace identity changes', async () => {
    const view = renderCanvas(null, 'workspace:a')
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.showExternalResources' }))
    await waitFor(() => expect(flowPropsRef.current?.nodes).toHaveLength(15))

    view.rerender(
      <WorkspaceMapCanvas
        activePath={null}
        editorLoadState={{ status: 'ready', content: '# Home' }}
        graph={createWorkspaceMapProductTestGraph()}
        graphIdentity="workspace:b"
        onActivateEditor={vi.fn()}
        onChange={vi.fn()}
        onCloseEditor={vi.fn()}
        onOpenFile={vi.fn()}
        onRetryEditor={vi.fn()}
        readOnly={false}
        showMiniMap={false}
      />,
    )

    await waitFor(() => expect(flowPropsRef.current?.nodes).toHaveLength(14))
    expect(screen.getByRole('button', { name: 'workspaceMap.showExternalResources' })).toBeVisible()
  })

  it('temporarily expands the active editor and returns it to the compact map state when closed', async () => {
    const view = renderCanvas()
    await waitFor(() =>
      expect(flowPropsRef.current?.nodes[0]).toMatchObject({ height: 112, width: 248 }),
    )

    view.rerender(
      <WorkspaceMapCanvas
        activePath="notes/Home.md"
        editorLoadState={{ status: 'ready', content: '# Home' }}
        graph={createWorkspaceMapProductTestGraph()}
        graphIdentity="workspace:a"
        onActivateEditor={vi.fn()}
        onChange={vi.fn()}
        onCloseEditor={vi.fn()}
        onOpenFile={vi.fn()}
        onRetryEditor={vi.fn()}
        readOnly={false}
        showMiniMap={false}
      />,
    )

    await waitFor(() =>
      expect(flowPropsRef.current?.nodes[0]).toMatchObject({ height: 480, width: 420 }),
    )

    view.rerender(
      <WorkspaceMapCanvas
        activePath={null}
        editorLoadState={{ status: 'ready', content: '# Home' }}
        graph={createWorkspaceMapProductTestGraph()}
        graphIdentity="workspace:a"
        onActivateEditor={vi.fn()}
        onChange={vi.fn()}
        onCloseEditor={vi.fn()}
        onOpenFile={vi.fn()}
        onRetryEditor={vi.fn()}
        readOnly={false}
        showMiniMap={false}
      />,
    )

    await waitFor(() =>
      expect(flowPropsRef.current?.nodes[0]).toMatchObject({ height: 112, width: 248 }),
    )
  })

  it('reveals only the engaged node neighborhood for pointer and keyboard focus', async () => {
    renderCanvas()
    const homeId = 'file:notes/Home.md'
    const neighborId = 'file:notes/note-1.md'
    const unrelatedId = 'file:notes/note-2.md'
    const nodeClassName = (nodeId: string) =>
      flowPropsRef.current?.nodes.find((node) => node.id === nodeId)?.className

    fireEvent.mouseEnter(screen.getByTestId(`flow-node-${homeId}`))

    await waitFor(() => {
      expect(flowPropsRef.current?.edges[0]?.className).toContain(
        'workspace-map-flow-edge--connected',
      )
      expect(nodeClassName(homeId)).toContain('workspace-map-flow-node--spotlight')
      expect(nodeClassName(neighborId)).toContain('workspace-map-flow-node--neighbor')
      expect(nodeClassName(unrelatedId)).toContain('workspace-map-flow-node--dimmed')
    })

    fireEvent.mouseLeave(screen.getByTestId(`flow-node-${homeId}`))
    await waitFor(() => {
      expect(flowPropsRef.current?.edges[0]?.className).toBeUndefined()
      expect(nodeClassName(homeId)).toBeUndefined()
      expect(nodeClassName(unrelatedId)).toBeUndefined()
    })

    fireEvent.focus(screen.getByTestId(`flow-node-${homeId}`))
    await waitFor(() =>
      expect(flowPropsRef.current?.edges[0]?.className).toContain(
        'workspace-map-flow-edge--connected',
      ),
    )
  })
})
