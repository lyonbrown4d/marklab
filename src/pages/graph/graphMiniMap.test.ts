import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import {
  getGraphMiniMapSize,
  getMiniMapNodeColor,
  shouldRenderGraphMiniMap,
} from '@/pages/graph/graphMiniMap'

const node = (type?: string): Node => ({
  id: type ?? 'file',
  data: {},
  position: { x: 0, y: 0 },
  type,
})

describe('graphMiniMap', () => {
  it('only renders the minimap when enabled and the graph benefits from navigation', () => {
    expect(shouldRenderGraphMiniMap(true, 4)).toBe(true)
    expect(shouldRenderGraphMiniMap(true, 3)).toBe(false)
    expect(shouldRenderGraphMiniMap(true, 1)).toBe(false)
    expect(shouldRenderGraphMiniMap(true, 0)).toBe(false)
    expect(shouldRenderGraphMiniMap(false, 4)).toBe(false)
  })

  it('uses semantic theme tokens for minimap node colors', () => {
    expect(getMiniMapNodeColor(node('file'))).toBe('hsl(var(--primary))')
    expect(getMiniMapNodeColor(node('heading'))).toBe('hsl(var(--primary))')
    expect(getMiniMapNodeColor(node('missing'))).toBe('hsl(var(--destructive))')
    expect(getMiniMapNodeColor(node('external'))).toBe('hsl(var(--status-warning))')
    expect(getMiniMapNodeColor(node())).toBe('hsl(var(--muted-foreground))')
  })

  it('offers an explicit compact minimap size for smaller canvases', () => {
    expect(getGraphMiniMapSize('compact')).toEqual({ height: 90, width: 128 })
    expect(getGraphMiniMapSize('regular')).toEqual({ height: 120, width: 168 })
  })
})
