import { NodeResizer } from '@xyflow/react'

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
  <NodeResizer
    handleClassName="nodrag nopan workspace-map-node__resize-handle"
    lineClassName="nodrag nopan workspace-map-node__resize-line"
    maxHeight={maxHeight}
    maxWidth={maxWidth}
    minHeight={minHeight}
    minWidth={minWidth}
  />
)
