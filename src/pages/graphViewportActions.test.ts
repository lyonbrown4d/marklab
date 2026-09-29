import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { adjustGraphZoom } from '@/pages/graphViewportActions'

describe('graph viewport actions', () => {
  it('keeps the selected topic under the same screen coordinate while zooming', () => {
    const setViewport = vi.fn()
    const flow = {
      getViewport: () => ({ x: 10, y: 20, zoom: 1 }),
      setViewport,
    }
    const selected = {
      id: 'heading:a',
      type: 'heading',
      data: { label: 'A' },
      position: { x: 100, y: 50 },
      measured: { width: 180, height: 60 },
    } as Node<GraphNodeData>

    adjustGraphZoom(flow as never, 'in', selected)

    const [viewport, options] = setViewport.mock.calls[0]
    expect(viewport.x).toBeCloseTo(-20.4)
    expect(viewport.y).toBeCloseTo(7.2)
    expect(viewport.zoom).toBe(1.16)
    expect(options).toEqual({ duration: 120 })
  })

  it('removes viewport animation when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const setViewport = vi.fn()
    adjustGraphZoom({ getViewport: () => ({ x: 0, y: 0, zoom: 1 }), setViewport } as never, 'out')
    expect(setViewport.mock.calls[0][1]).toEqual({ duration: 0 })
    vi.unstubAllGlobals()
  })
})
