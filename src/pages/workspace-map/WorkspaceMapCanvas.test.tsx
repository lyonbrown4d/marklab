import { fireEvent, render, screen } from '@testing-library/react'
import { useState, type Dispatch, type KeyboardEventHandler, type SetStateAction } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMapCanvas } from '@/pages/workspace-map/WorkspaceMapCanvas'
import type { GraphData, GraphNodeData } from '@/logic/graph'

type FlowProps = {
  elementsSelectable: boolean
  nodes: GraphData['nodes']
  nodesFocusable: boolean
  onlyRenderVisibleElements: boolean
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

const flowPropsRef = vi.hoisted(() => ({ current: null as FlowProps | null }))

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
          <div className="react-flow__node" data-id={node.id} key={node.id} tabIndex={0}>
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
  useWorkspaceMapLayout: () => undefined,
}))

const graph: GraphData = {
  nodes: [
    {
      id: 'file:notes/a.md',
      type: 'file',
      data: { label: 'A', path: 'notes/a.md' },
      position: { x: 0, y: 0 },
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

    fireEvent.keyDown(screen.getByRole('textbox'), { key: ' ' })
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
})
