import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { getMiniMapNodeColor, shouldRenderGraphMiniMap } from '@/pages/graph/graphMiniMap'

const node = (type?: string): Node => ({
  id: type ?? 'file',
  data: {},
  position: { x: 0, y: 0 },
  type,
})

describe('graphMiniMap', () => {
  it('only renders the minimap when enabled and there are visible nodes', () => {
    expect(shouldRenderGraphMiniMap(true, 3)).toBe(true)
    expect(shouldRenderGraphMiniMap(true, 0)).toBe(false)
    expect(shouldRenderGraphMiniMap(false, 3)).toBe(false)
  })

  it('uses semantic theme tokens for minimap node colors', () => {
    expect(getMiniMapNodeColor(node('heading'))).toBe('hsl(var(--primary))')
    expect(getMiniMapNodeColor(node('missing'))).toBe('hsl(var(--destructive))')
    expect(getMiniMapNodeColor(node('external'))).toBe('hsl(var(--status-warning))')
    expect(getMiniMapNodeColor(node())).toBe('hsl(var(--muted-foreground))')
  })
})
