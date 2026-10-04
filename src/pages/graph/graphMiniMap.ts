import type { Node } from '@xyflow/react'
import type { GraphMiniMapSize } from '@/store/appTypes'

const MINIMAP_NAVIGATION_NODE_THRESHOLD = 4

export const shouldRenderGraphMiniMap = (showMiniMap: boolean, visibleNodeCount: number) =>
  showMiniMap && visibleNodeCount >= MINIMAP_NAVIGATION_NODE_THRESHOLD

export const getGraphMiniMapSize = (size: GraphMiniMapSize) =>
  size === 'compact' ? { height: 90, width: 128 } : { height: 120, width: 168 }

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
