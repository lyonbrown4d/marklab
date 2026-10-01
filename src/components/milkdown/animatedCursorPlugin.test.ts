import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnimatedCursorView } from '@/components/milkdown/animatedCursorPlugin'

const createState = () => ({
  doc: { eq: vi.fn(() => true) },
  selection: { empty: true, eq: vi.fn(() => true), head: 4 },
})

const createView = (state = createState()) => {
  const dom = document.createElement('div')
  dom.className = 'ProseMirror'
  document.body.append(dom)
  return {
    coordsAtPos: vi.fn(() => ({ bottom: 32, left: 24, right: 24, top: 16 })),
    dom,
    hasFocus: () => true,
    state,
  }
}

describe('animatedCursorPlugin', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does not schedule geometry work when the document and selection are unchanged', () => {
    const callbacks: FrameRequestCallback[] = []
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    window.cancelAnimationFrame = vi.fn()
    const initialState = createState()
    const view = createView(initialState)
    const pluginView = createAnimatedCursorView(view as never)

    callbacks.shift()?.(0)
    pluginView.update(view as never, initialState as never)

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    pluginView.destroy()
  })
})
