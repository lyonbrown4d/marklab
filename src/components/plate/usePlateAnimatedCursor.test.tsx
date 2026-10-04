import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePlateAnimatedCursor } from '@/components/plate/usePlateAnimatedCursor'

const AnimatedCursorHarness = () => {
  const editableRef = useRef<HTMLDivElement>(null)

  usePlateAnimatedCursor({ editableRef, enabled: true })

  return (
    <div
      contentEditable
      data-testid="editable"
      ref={editableRef}
      suppressContentEditableWarning
      tabIndex={0}
    >
      Paragraph
    </div>
  )
}

describe('usePlateAnimatedCursor', () => {
  it('hides the portal caret while the window is unfocused even when the editor stays active', () => {
    let nextFrameId = 0
    const animationFrames = new Map<number, FrameRequestCallback>()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = ++nextFrameId
      animationFrames.set(frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      animationFrames.delete(frameId)
    })
    const documentHasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const flushAnimationFrame = () => {
      const callbacks = [...animationFrames.values()]
      animationFrames.clear()
      act(() => callbacks.forEach((callback) => callback(performance.now())))
    }

    render(<AnimatedCursorHarness />)
    const editable = screen.getByTestId('editable')
    const text = editable.firstChild
    expect(text).toBeInstanceOf(Text)

    const range = document.createRange()
    range.setStart(text!, 2)
    range.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    editable.focus()
    document.dispatchEvent(new Event('selectionchange'))
    Object.defineProperty(selection.getRangeAt(0), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 42, height: 20, left: 36, right: 36, top: 22, width: 0 }),
    })
    expect(document.activeElement).toBe(editable)
    expect(editable.contains(selection.anchorNode)).toBe(true)
    expect(typeof selection.getRangeAt(0).getBoundingClientRect).toBe('function')
    flushAnimationFrame()

    const caret = document.querySelector<HTMLElement>(
      '[data-marklab-plate-overlay="animated-cursor"]',
    )
    expect(caret).toHaveClass('is-visible')

    documentHasFocus.mockReturnValue(false)
    Object.defineProperty(selection.getRangeAt(0), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }),
    })
    window.dispatchEvent(new Event('blur'))
    document.dispatchEvent(new Event('selectionchange'))
    flushAnimationFrame()

    expect(document.activeElement).toBe(editable)
    expect(caret).not.toHaveClass('is-visible')
    expect(editable).not.toHaveClass('marklab-animated-cursor-host')
  })
})
