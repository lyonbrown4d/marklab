import { describe, expect, it } from 'vitest'
import {
  getDropIndicatorLayout,
  getDropIndicatorPosition,
  parseCssPixelValue,
  shouldAllowEdgeAutoScroll,
} from '@/components/milkdown/markdownDropIndicatorGeometry'

const rect = ({
  bottom,
  left,
  right,
  top,
}: {
  bottom: number
  left: number
  right: number
  top: number
}) => ({ bottom, left, right, top }) as DOMRect

describe('markdown editor drop indicator layout', () => {
  it('chooses before or after from the pointer position inside the target block', () => {
    const blockRect = rect({ bottom: 180, left: 400, right: 820, top: 100 })

    expect(getDropIndicatorPosition(120, blockRect)).toBe('before')
    expect(getDropIndicatorPosition(170, blockRect)).toBe('after')
  })

  it('bridges the editor gutter while keeping the line anchored to the block edge', () => {
    const layout = getDropIndicatorLayout({
      blockRect: rect({ bottom: 180, left: 400, right: 820, top: 100 }),
      clientY: 170,
      clampRect: rect({ bottom: 720, left: 300, right: 980, top: 80 }),
      gutterOffsetPx: -38,
    })

    expect(layout).toEqual({
      position: 'after',
      width: 458,
      x: 362,
      y: 180,
    })
  })

  it('clamps the indicator inside the editor shell', () => {
    const layout = getDropIndicatorLayout({
      blockRect: rect({ bottom: 72, left: 320, right: 360, top: 40 }),
      clientY: 42,
      clampRect: rect({ bottom: 720, left: 300, right: 980, top: 20 }),
      gutterOffsetPx: -64,
    })

    expect(layout).toEqual({
      position: 'before',
      width: 64,
      x: 300,
      y: 40,
    })
  })

  it('parses pixel CSS variables defensively', () => {
    expect(parseCssPixelValue(' -38px ', -12)).toBe(-38)
    expect(parseCssPixelValue('-2.375rem', -12)).toBe(-12)
    expect(parseCssPixelValue('', -12)).toBe(-12)
  })

  it('allows native auto scroll only near the editor viewport edges', () => {
    const viewport = {
      getBoundingClientRect: () => rect({ bottom: 500, left: 0, right: 600, top: 100 }),
    } as HTMLElement

    expect(shouldAllowEdgeAutoScroll({ clientY: 120 } as DragEvent, viewport)).toBe(true)
    expect(shouldAllowEdgeAutoScroll({ clientY: 300 } as DragEvent, viewport)).toBe(false)
    expect(shouldAllowEdgeAutoScroll({ clientY: 480 } as DragEvent, viewport)).toBe(true)
  })
})
