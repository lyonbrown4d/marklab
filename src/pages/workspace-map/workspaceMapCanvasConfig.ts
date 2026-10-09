import type { NodeTypes } from '@xyflow/react'
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
