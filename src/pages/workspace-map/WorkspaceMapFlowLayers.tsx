import { Background, BackgroundVariant, Controls } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { GraphMiniMap } from '@/pages/graph/GraphMiniMapView'
import type { GraphNodeData } from '@/logic/graph'
import { WorkspaceMapGroupRegions } from '@/pages/workspace-map/WorkspaceMapGroupRegions'
import { workspaceMapToolbarAwareMiniMapOffsets } from '@/pages/workspace-map/workspaceMapCanvasConfig'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'

type WorkspaceMapFlowLayersProps = {
  mode: WorkspaceMapMode
  nodes: Node<GraphNodeData>[]
  showMiniMap: boolean
}

export const WorkspaceMapFlowLayers = ({
  mode,
  nodes,
  showMiniMap,
}: WorkspaceMapFlowLayersProps) => (
  <>
    <Background
      variant={BackgroundVariant.Dots}
      gap={24}
      size={1}
      color="hsl(var(--muted-foreground) / 0.22)"
    />
    {mode === 'overview' ? <WorkspaceMapGroupRegions nodes={nodes} /> : null}
    <Controls
      position="bottom-right"
      showInteractive={false}
      fitViewOptions={{ maxZoom: 1, minZoom: 0.35, padding: 0.22 }}
    />
    <GraphMiniMap
      nodeCount={nodes.length}
      offsets={workspaceMapToolbarAwareMiniMapOffsets}
      show={showMiniMap}
    />
  </>
)
