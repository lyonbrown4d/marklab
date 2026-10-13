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
    handleClassName="nodrag nopan workspace-map-node__resize-handle z-[4] !size-2.5 !rounded-[3px] !border !border-[color-mix(in_srgb,hsl(var(--primary))_62%,hsl(var(--border)))] !bg-[color-mix(in_srgb,hsl(var(--card))_92%,transparent)] shadow-[0_3px_10px_-5px_color-mix(in_srgb,hsl(var(--foreground))_48%,transparent)] opacity-[0.78] transition-[border-color,background-color,opacity,transform] duration-[var(--motion-duration-fast)] ease-[ease] group-hover/map-node:!border-primary group-hover/map-node:!bg-primary group-hover/map-node:opacity-100 group-hover/map-node:transform-[scale(1.18)] hover:!border-primary hover:!bg-primary hover:opacity-100 hover:transform-[scale(1.18)] motion-reduce:transition-none"
    lineClassName="nodrag nopan workspace-map-node__resize-line z-[3] !border-[color-mix(in_srgb,hsl(var(--primary))_42%,transparent)] opacity-[0.55] transition-[border-color,opacity] duration-[var(--motion-duration-fast)] ease-[ease] group-hover/map-node:!border-[color-mix(in_srgb,hsl(var(--primary))_76%,transparent)] group-hover/map-node:opacity-90 motion-reduce:transition-none"
    maxHeight={maxHeight}
    maxWidth={maxWidth}
    minHeight={minHeight}
    minWidth={minWidth}
  />
)
