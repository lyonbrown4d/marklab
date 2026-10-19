import { Background, BackgroundVariant, Controls } from '@xyflow/react'
import { memo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { GraphMiniMap } from '@/pages/graph/GraphMiniMapView'
import type { GraphNodeData } from '@/logic/graph'
import { WorkspaceMapGroupRegions } from '@/pages/workspace-map/WorkspaceMapGroupRegions'
import { workspaceMapToolbarAwareMiniMapOffsets } from '@/pages/workspace-map/workspaceMapCanvasConfig'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'
import { WorkspaceMapOverviewEdges } from '@/pages/workspace-map/WorkspaceMapOverviewEdges'

type WorkspaceMapFlowLayersProps = {
  edges: Edge[]
  mode: WorkspaceMapMode
  nodes: Node<GraphNodeData>[]
  showMiniMap: boolean
}

const FIT_VIEW_OPTIONS = { maxZoom: 1, minZoom: 0.35, padding: 0.22 }

const WorkspaceMapFlowControls = memo(() => (
  <>
    <Background
      variant={BackgroundVariant.Dots}
      gap={24}
      size={1}
      color="hsl(var(--muted-foreground) / 0.22)"
    />
    <Controls position="bottom-right" showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS} />
  </>
))

export const WorkspaceMapFlowLayers = memo(
  ({ edges, mode, nodes, showMiniMap }: WorkspaceMapFlowLayersProps) => (
    <>
      <WorkspaceMapFlowControls />
      {mode === 'overview' ? <WorkspaceMapGroupRegions nodes={nodes} /> : null}
      {mode === 'overview' ? <WorkspaceMapOverviewEdges edges={edges} /> : null}
      <GraphMiniMap
        nodeCount={nodes.length}
        offsets={workspaceMapToolbarAwareMiniMapOffsets}
        show={showMiniMap}
      />
    </>
  ),
)
