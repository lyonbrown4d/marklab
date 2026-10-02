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
    vi.useRealTimers()
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

  it('uses the native caret without forced geometry in large-document mode', () => {
    window.requestAnimationFrame = vi.fn(() => 1)
    window.cancelAnimationFrame = vi.fn()
    const shell = document.createElement('div')
    shell.className = 'crepe'
    shell.dataset.largeDocument = 'true'
    const view = createView()
    shell.append(view.dom)
    document.body.append(shell)

    const pluginView = createAnimatedCursorView(view as never)

    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    expect(view.coordsAtPos).not.toHaveBeenCalled()
    pluginView.destroy()
  })

  it('yields to the native caret while an IME composition is active', () => {
    const callbacks: FrameRequestCallback[] = []
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    window.cancelAnimationFrame = vi.fn()
    const view = { ...createView(), composing: false }
    const pluginView = createAnimatedCursorView(view as never)
    const caret = document.querySelector('.marklab-animated-caret')

    callbacks.shift()?.(0)
    expect(caret).toHaveClass('is-visible')

    view.composing = true
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'))
    callbacks.shift()?.(0)
    expect(caret).not.toHaveClass('is-visible')

    view.composing = false
    view.dom.dispatchEvent(new CompositionEvent('compositionend'))
    callbacks.shift()?.(0)
    expect(caret).toHaveClass('is-visible')
    pluginView.destroy()
  })

  it('tracks the outer virtualized viewport while a segment scrolls', () => {
    vi.useFakeTimers()
    const callbacks: FrameRequestCallback[] = []
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    window.cancelAnimationFrame = vi.fn()
    const viewport = document.createElement('div')
    viewport.className = 'virtualized-markdown-editor'
    const milkdown = document.createElement('div')
    milkdown.className = 'milkdown'
    const view = createView()
    milkdown.append(view.dom)
    viewport.append(milkdown)
    document.body.append(viewport)
    const pluginView = createAnimatedCursorView(view as never)
    callbacks.shift()?.(0)
    view.coordsAtPos.mockReturnValue({ bottom: 80, left: 24, right: 24, top: 64 })

    viewport.dispatchEvent(new Event('scroll'))
    expect(view.coordsAtPos).toHaveBeenCalledOnce()
    expect(document.querySelector('.marklab-animated-caret')).not.toHaveClass('is-visible')
    vi.advanceTimersByTime(100)
    callbacks.shift()?.(0)

    expect(view.coordsAtPos).toHaveBeenCalledTimes(2)
    expect(
      document
        .querySelector<HTMLElement>('.marklab-animated-caret')
        ?.style.getPropertyValue('--marklab-caret-y'),
    ).toBe('64px')
    pluginView.destroy()
  })
})
