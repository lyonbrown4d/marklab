import { act, render, waitFor } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

type FlowProps = {
  children?: ReactNode
  nodes: Node<GraphNodeData>[]
  nodesDraggable?: boolean
  panOnDrag?: boolean
  zoomOnDoubleClick?: boolean
  zoomOnPinch?: boolean
  zoomOnScroll?: boolean
  onNodeDoubleClick?: (event: { preventDefault: () => void }, node: Node<GraphNodeData>) => void
}

const flowProps = vi.hoisted(() => ({ current: null as FlowProps | null }))

vi.mock('@xyflow/react', () => ({
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlow: (props: FlowProps) => {
    flowProps.current = props
    return <div data-testid="flow">{props.children}</div>
  },
  useEdgesState: (initial: Edge[]) => [initial, vi.fn(), vi.fn()],
  useNodesState: (initial: Node<GraphNodeData>[]) => [initial, vi.fn(), vi.fn()],
}))
vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/useGraphAutoLayout', () => ({ useGraphAutoLayout: vi.fn() }))
vi.mock('@/pages/useGraphKeyboardActions', () => ({
  useGraphKeyboardActions: ({ edges, nodes }: { edges: Edge[]; nodes: Node<GraphNodeData>[] }) => ({
    handleGraphMouseDown: vi.fn(),
    visibleEdges: edges,
    visibleNodes: nodes,
  }),
}))
vi.mock('@/pages/graph/GraphToolbar', () => ({ GraphToolbar: () => null }))
vi.mock('@/pages/graph/GraphInspector', () => ({ GraphInspector: () => null }))
vi.mock('@/pages/graph/GraphEmptyState', () => ({ GraphEmptyState: () => null }))
vi.mock('@/pages/graph/GraphFeedbackToast', () => ({ GraphFeedbackToast: () => null }))
vi.mock('@/pages/graph/MindmapGraphPage', () => ({ MindmapGraphPage: () => null }))

import GraphPage from '@/pages/GraphPage'

const externalNode: Node<GraphNodeData> = {
  id: 'ext:https://example.com',
  type: 'external',
  data: { label: 'Example', url: 'https://example.com' },
  position: { x: 0, y: 0 },
}

const props = {
  graph: { edges: [], layoutKey: 'graph-a', nodes: [externalNode] },
  contentMode: 'none',
  editable: false,
  onAddChildHeading: vi.fn(),
  onAddSiblingHeading: vi.fn(),
  onAddSiblingHeadingBefore: vi.fn(),
  onDeleteHeading: vi.fn(),
  onOpenFile: vi.fn(),
  onUpdateHeadingContent: vi.fn(),
  onUpdateHeadingTitle: vi.fn(),
  presentation: 'graph',
  showMiniMap: false,
} satisfies ComponentProps<typeof GraphPage>

describe('KnowledgeGraphPage interactions', () => {
  beforeEach(() => {
    flowProps.current = null
  })

  it('keeps graph dragging, panning, and viewport zoom enabled during web interaction', async () => {
    render(<GraphPage {...props} />)
    expect(flowProps.current).toBeTruthy()

    act(() => {
      flowProps.current?.onNodeDoubleClick?.({ preventDefault: vi.fn() }, externalNode)
    })
    await waitFor(() => expect(flowProps.current?.nodes[0]?.data.webView?.active).toBe(true))

    expect(flowProps.current).toMatchObject({
      nodesDraggable: true,
      panOnDrag: true,
      zoomOnDoubleClick: true,
      zoomOnPinch: true,
      zoomOnScroll: true,
    })
  })
})
