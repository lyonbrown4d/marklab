import { memo, useEffect, useMemo, useRef } from 'react'
import { ViewportPortal } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { createWorkspaceMapGroupRegions } from '@/pages/workspace-map/workspaceMapGroups'

type WorkspaceMapGroupRegionsProps = {
  nodes: Node<GraphNodeData>[]
}

export const WorkspaceMapGroupRegions = memo(({ nodes }: WorkspaceMapGroupRegionsProps) => {
  const groupMemberDragging = nodes.some(
    (node) => node.dragging && Boolean(node.data.workspaceGroup),
  )
  const liveRegions = useMemo(
    () => (groupMemberDragging ? null : createWorkspaceMapGroupRegions(nodes)),
    [groupMemberDragging, nodes],
  )
  const settledRegionsRef = useRef(liveRegions ?? [])
  useEffect(() => {
    if (liveRegions) settledRegionsRef.current = liveRegions
  }, [liveRegions])
  const regions = liveRegions ?? settledRegionsRef.current
  if (regions.length === 0) return null

  return (
    <ViewportPortal>
      <div
        className="workspace-map-groups pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
      >
        {regions.map((region) => (
          <section
            className="workspace-map-group-region absolute isolate rounded-[40px] border border-[color-mix(in_srgb,hsl(var(--workspace-group-color))_8%,hsl(var(--border)))] bg-[color-mix(in_srgb,hsl(var(--workspace-group-color))_5.5%,hsl(var(--background)))] [contain:layout_paint_style] [--workspace-group-color:211_92%_58%] data-[color=1]:[--workspace-group-color:154_54%_42%] data-[color=2]:[--workspace-group-color:354_74%_58%] data-[color=3]:[--workspace-group-color:268_64%_62%] data-[color=4]:[--workspace-group-color:34_86%_54%] data-[color=5]:[--workspace-group-color:184_62%_43%] dark:border-[color-mix(in_srgb,hsl(var(--workspace-group-color))_14%,hsl(var(--border)))] dark:bg-[color-mix(in_srgb,hsl(var(--workspace-group-color))_8%,hsl(var(--background)))]"
            data-color={region.colorIndex}
            data-testid={region.testId}
            key={region.key}
            style={{
              height: region.height,
              left: region.x,
              top: region.y,
              width: region.width,
            }}
          >
            <div className="workspace-map-group-region__label absolute left-[30px] top-[22px] flex items-baseline gap-2 text-[hsl(var(--workspace-group-color)/82%)]">
              <strong className="text-base font-[650] tracking-[-0.01em]">{region.label}</strong>
              <span className="text-[10px] text-muted-foreground">{region.nodeCount}</span>
            </div>
          </section>
        ))}
      </div>
    </ViewportPortal>
  )
})
