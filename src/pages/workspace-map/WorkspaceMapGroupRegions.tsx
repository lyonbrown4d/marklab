import { memo, useMemo } from 'react'
import { ViewportPortal } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { createWorkspaceMapGroupRegions } from '@/pages/workspace-map/workspaceMapGroups'

type WorkspaceMapGroupRegionsProps = {
  nodes: Node<GraphNodeData>[]
}

export const WorkspaceMapGroupRegions = memo(({ nodes }: WorkspaceMapGroupRegionsProps) => {
  const regions = useMemo(() => createWorkspaceMapGroupRegions(nodes), [nodes])
  if (regions.length === 0) return null

  return (
    <ViewportPortal>
      <div className="workspace-map-groups" aria-hidden="true">
        {regions.map((region) => (
          <section
            className="workspace-map-group-region"
            data-color={region.colorIndex}
            data-testid={region.testId}
            key={region.key}
            style={{
              height: region.height,
              transform: `translate(${region.x}px, ${region.y}px)`,
              width: region.width,
            }}
          >
            <div className="workspace-map-group-region__label">
              <strong>{region.label}</strong>
              <span>{region.nodeCount}</span>
            </div>
          </section>
        ))}
      </div>
    </ViewportPortal>
  )
})
