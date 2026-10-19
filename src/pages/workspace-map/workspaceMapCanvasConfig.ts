import type { Edge, Node, NodeTypes, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { workspaceMiniMapOffsets } from '@/pages/graph/GraphMiniMapView'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'

export const workspaceMapNodeTypes: NodeTypes = {
  external: WorkspaceMapReferenceNode,
  file: WorkspaceMapFileNode,
  missing: WorkspaceMapReferenceNode,
  preview: WorkspaceMapReferenceNode,
}

export const workspaceMapToolbarAwareMiniMapOffsets = {
  ...workspaceMiniMapOffsets,
  'top-left': { marginTop: 52 },
}

export const createWorkspaceMapLayoutFlow = (
  flow: ReactFlowInstance<Node<GraphNodeData>, Edge> | null,
) =>
  flow
    ? {
        fitView: (options?: Parameters<typeof flow.fitView>[0]) =>
          flow.fitView({
            ...options,
            maxZoom: Math.min(options?.maxZoom ?? 1, 1),
            minZoom: Math.max(options?.minZoom ?? 0.35, 0.35),
          }),
        setViewport: flow.setViewport,
      }
    : null
