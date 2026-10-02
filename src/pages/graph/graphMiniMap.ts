import type { Node } from '@xyflow/react'

const MINIMAP_NAVIGATION_NODE_THRESHOLD = 4

export const shouldRenderGraphMiniMap = (showMiniMap: boolean, visibleNodeCount: number) =>
  showMiniMap && visibleNodeCount >= MINIMAP_NAVIGATION_NODE_THRESHOLD

export const getMiniMapNodeColor = (node: Node) =>
  node.type === 'file'
    ? 'hsl(var(--primary))'
    : node.type === 'heading'
      ? 'hsl(var(--primary))'
      : node.type === 'missing'
        ? 'hsl(var(--destructive))'
        : node.type === 'external'
          ? 'hsl(var(--status-warning))'
          : 'hsl(var(--muted-foreground))'
