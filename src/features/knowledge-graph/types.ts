import type { GraphData } from '@/logic/graph'

export type GraphCameraState = { x: number; y: number; ratio: number; angle: number }
export type GraphFocusRequest = { nodeId: string; viewport?: GraphCameraState }

export type KnowledgeGraphCanvasProps = {
  graph: GraphData
  workspaceKey: string
  viewKey?: string
  active?: boolean
  selectedNodeId?: string | null
  onSelectNode: (id: string | null) => void
  onOpenNode: (id: string) => void
  focusRequest?: GraphFocusRequest | null
  onFocusConsumed?: () => void
  onCameraChange?: (camera: GraphCameraState) => void
}
