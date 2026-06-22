import type { Node } from '@xyflow/react'

export const getMiniMapNodeColor = (node: Node) =>
  node.type === 'heading'
    ? 'hsl(var(--primary))'
    : node.type === 'missing'
      ? 'hsl(var(--destructive))'
      : node.type === 'external'
        ? '#f59e0b'
        : 'hsl(var(--muted-foreground))'
