import type { KeyboardEventHandler, MouseEvent as ReactMouseEvent } from 'react'
import type { GraphData } from '@/logic/graph'

export type WorkspaceMapFlowApi = {
  fitView: ReturnType<typeof import('vitest').vi.fn>
  zoomIn: ReturnType<typeof import('vitest').vi.fn>
  zoomOut: ReturnType<typeof import('vitest').vi.fn>
}

export type WorkspaceMapFlowProps = {
  elementsSelectable: boolean
  nodes: GraphData['nodes']
  nodesDraggable: boolean
  nodeDragThreshold: number
  nodesFocusable: boolean
  onlyRenderVisibleElements: boolean
  panOnScroll: boolean
  panOnScrollMode: string
  preventScrolling: boolean
  onInit?: (flow: WorkspaceMapFlowApi) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onNodeClick?: (event: ReactMouseEvent<HTMLDivElement>, node: GraphData['nodes'][number]) => void
  onPaneClick?: () => void
  tabIndex: number
  zoomOnPinch: boolean
  zoomOnScroll: boolean
}
