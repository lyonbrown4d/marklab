import { NodeResizeControl } from '@xyflow/react'
import { Scaling } from 'lucide-react'

type WorkspaceMapNodeResizeControlProps = {
  maxHeight?: number
  maxWidth?: number
  minHeight: number
  minWidth: number
}

export const WorkspaceMapNodeResizeControl = ({
  maxHeight = 960,
  maxWidth = 1200,
  minHeight,
  minWidth,
}: WorkspaceMapNodeResizeControlProps) => (
  <NodeResizeControl
    className="nodrag nopan workspace-map-node__resize-control"
    maxHeight={maxHeight}
    maxWidth={maxWidth}
    minHeight={minHeight}
    minWidth={minWidth}
    position="bottom-right"
  >
    <Scaling aria-hidden="true" className="size-3" />
  </NodeResizeControl>
)
