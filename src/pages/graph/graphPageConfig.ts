import type { Edge, Node, NodeTypes, ReactFlowInstance } from '@xyflow/react'
import { ExternalNode, HeadingNode, MissingNode, PreviewNode } from '@/components/GraphNodes'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import type { GraphContentMode } from '@/store/appTypes'

export type GraphPageProps = {
  graph: GraphData
  onOpenFile: (path: string) => void
  showMiniMap: boolean
  contentMode: GraphContentMode
  editable: boolean
  onAddChildHeading: (nodeId: string) => string | null
  onAddSiblingHeading: (nodeId: string) => string | null
  onAddSiblingHeadingBefore: (nodeId: string) => string | null
  onDeleteHeading: (nodeId: string) => string | null
  onUpdateHeadingTitle: (nodeId: string, title: string) => void
  onUpdateHeadingContent: NonNullable<GraphNodeData['onUpdateContent']>
}

export type GraphFlowInstance = ReactFlowInstance<Node<GraphNodeData>, Edge> | null

export const nodeTypes: NodeTypes = {
  external: ExternalNode,
  heading: HeadingNode,
  missing: MissingNode,
  preview: PreviewNode,
}

export const fitViewOptions = { padding: 0.22 }
export const proOptions = { hideAttribution: true }
