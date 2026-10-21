import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { notifyAnimatedCursorViewport } from '@/components/plate/animatedCursorViewport'
import { usePlateAnimatedCursor } from '@/components/plate/usePlateAnimatedCursor'

const AnimatedCursorHarness = ({ color }: { color?: string }) => {
  const editableRef = useRef<HTMLDivElement>(null)
  usePlateAnimatedCursor({ editableRef, enabled: true })
  return (
    <div
      data-marklab-cursor-viewport
      data-testid="transformed-viewport"
      style={{ overflow: 'auto' }}
    >
      <div
        contentEditable
        data-testid="editable"
        ref={editableRef}
        style={{ color }}
        suppressContentEditableWarning
        tabIndex={0}
      >
        Paragraph
      </div>
    </div>
  )
}

const setupCursor = (color?: string) => {
  let nextFrameId = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++nextFrameId
    frames.set(id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
  const documentHasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const flush = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    act(() => callbacks.forEach((callback) => callback(performance.now())))
  }
  const rendered = render(<AnimatedCursorHarness color={color} />)
  const editable = screen.getByTestId('editable')
  const range = document.createRange()
  range.setStart(editable.firstChild!, 2)
  range.collapse(true)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  editable.focus()
  let rect = { bottom: 42, height: 20, left: 36, right: 36, top: 22, width: 0 }
  Object.defineProperty(selection.getRangeAt(0), 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  })
  document.dispatchEvent(new Event('selectionchange'))
  flush()
  const caret = document.querySelector<HTMLElement>(
    '[data-marklab-plate-overlay="animated-cursor"]',
  )!
  return {
    ...rendered,
    caret,
    documentHasFocus,
    editable,
    flush,
    frames,
    move: (point: Partial<typeof rect>) => {
      rect = { ...rect, ...point }
    },
    selection,
    viewport: screen.getByTestId('transformed-viewport'),
  }
}

describe('usePlateAnimatedCursor', () => {
  it('inherits the editor text color in its body portal', () => {
    const { caret } = setupCursor('rgb(31, 41, 55)')
    expect(caret.style.getPropertyValue('--marklab-caret-color')).toBe('rgb(31, 41, 55)')
    expect(caret.parentElement).toBe(document.body)
  })

  it('hides the caret on window blur even when the editor stays active', () => {
    const { caret, documentHasFocus, editable, flush, move, selection } = setupCursor()
    expect(caret).toHaveClass('is-visible')
    documentHasFocus.mockReturnValue(false)
    move({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 })
    window.dispatchEvent(new Event('blur'))
    document.dispatchEvent(new Event('selectionchange'))
    flush()
    expect(document.activeElement).toBe(editable)
    expect(editable.contains(selection.anchorNode)).toBe(true)
    expect(caret).not.toHaveClass('is-visible')
    expect(editable).not.toHaveClass('marklab-animated-cursor-host')
  })

  it('follows canvas movement and ancestor scrolling without a permanent frame loop', () => {
    const { caret, flush, frames, move, viewport } = setupCursor()
    expect(caret.style.getPropertyValue('--marklab-caret-x')).toBe('35px')
    expect(frames.size).toBe(0)
    move({ left: 136 })
    notifyAnimatedCursorViewport(viewport)
    expect(frames.size).toBe(1)
    flush()
    expect(caret.style.getPropertyValue('--marklab-caret-x')).toBe('135px')
    move({ top: 72 })
    fireEvent.scroll(viewport)
    flush()
    expect(caret.style.getPropertyValue('--marklab-caret-y')).toBe('72px')
    expect(caret).not.toHaveClass('is-animating')
    expect(frames.size).toBe(0)
  })

  it('snaps to typing and line changes, and animates only same-line arrow navigation', () => {
    const { caret, editable, flush, move } = setupCursor()
    expect(caret).not.toHaveClass('is-animating')
    fireEvent.keyDown(editable, { key: 'ArrowRight' })
    move({ left: 48 })
    document.dispatchEvent(new Event('selectionchange'))
    flush()
    expect(caret).toHaveClass('is-animating')
    fireEvent.input(editable)
    move({ left: 96 })
    flush()
    expect(caret.style.getPropertyValue('--marklab-caret-x')).toBe('95px')
    expect(caret).not.toHaveClass('is-animating')
    fireEvent.keyDown(editable, { key: 'ArrowRight' })
    move({ left: 20, top: 50 })
    flush()
    expect(caret).not.toHaveClass('is-animating')
    expect(caret.style.getPropertyValue('--marklab-caret-y')).toBe('50px')
  })

  it('clips the portal caret to scroll containers and restores it after scrolling back', () => {
    const { caret, flush, move, viewport } = setupCursor()
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 300,
      bottom: 100,
      width: 300,
      height: 100,
    } as DOMRect)
    move({ top: 120, bottom: 140 })
    fireEvent.scroll(viewport)
    flush()
    expect(caret).not.toHaveClass('is-visible')
    move({ top: 40, bottom: 60 })
    fireEvent.scroll(viewport)
    flush()
    expect(caret).toHaveClass('is-visible')
    expect(caret.style.getPropertyValue('--marklab-caret-y')).toBe('40px')
  })

  it('keeps the native IME caret and rejects zero-height geometry instead of drawing at the origin', () => {
    const { caret, editable, flush, move, unmount } = setupCursor()
    fireEvent.compositionStart(editable)
    expect(caret).not.toHaveClass('is-visible')
    expect(editable).not.toHaveClass('marklab-animated-cursor-host')
    fireEvent.compositionEnd(editable)
    move({ left: 90 })
    flush()
    expect(caret).toHaveClass('is-visible')
    expect(caret).not.toHaveClass('is-animating')
    move({ height: 0, left: 0, top: 0 })
    document.dispatchEvent(new Event('selectionchange'))
    flush()
    expect(caret).not.toHaveClass('is-visible')
    expect(editable).not.toHaveClass('marklab-animated-cursor-host')
    unmount()
    expect(document.body.contains(caret)).toBe(false)
  })
})
