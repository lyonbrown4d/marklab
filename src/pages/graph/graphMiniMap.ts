import type { Node } from '@xyflow/react'

export const shouldRenderGraphMiniMap = (showMiniMap: boolean, visibleNodeCount: number) =>
  showMiniMap && visibleNodeCount > 0

export const getMiniMapNodeColor = (node: Node) =>
  node.type === 'heading'
    ? 'hsl(var(--primary))'
    : node.type === 'missing'
      ? 'hsl(var(--destructive))'
      : node.type === 'external'
        ? 'hsl(var(--status-warning))'
        : 'hsl(var(--muted-foreground))'
