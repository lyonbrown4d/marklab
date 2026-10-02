import { fireEvent, render, screen } from '@testing-library/react'
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
  nodesFocusable: boolean
  onlyRenderVisibleElements: boolean
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onNodeClick?: (event: ReactMouseEvent<HTMLDivElement>, node: GraphData['nodes'][number]) => void
}

const flowPropsRef = vi.hoisted(() => ({ current: null as FlowProps | null }))
const layoutStatusRef = vi.hoisted(() => ({ current: 'ready' as 'error' | 'loading' | 'ready' }))
const layoutRetry = vi.hoisted(() => vi.fn())

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
  useWorkspaceMapLayout: ({ flow }: { flow: { fitView: () => Promise<boolean> } | null }) => {
    const status = layoutStatusRef.current
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
    expect(flowPropsRef.current?.elementsSelectable).toBe(false)
    expect(flowPropsRef.current?.nodes[0]).toMatchObject({
      ariaLabel: 'A',
      ariaRole: 'button',
      focusable: true,
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
})
