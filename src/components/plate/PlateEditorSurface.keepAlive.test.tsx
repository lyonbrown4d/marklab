import { act, render, screen, waitFor } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

type ActiveSurface = 'first' | 'second' | null

const SurfacePair = ({
  active,
  firstRef,
  secondRef,
}: {
  active: ActiveSurface
  firstRef: RefObject<PlateEditorSurfaceHandle | null>
  secondRef: RefObject<PlateEditorSurfaceHandle | null>
}) => (
  <>
    <PlateEditorSurface
      activePath="first.md"
      autoFocus
      className="markdown-editor is-focus-editor"
      interactionActive={active === 'first'}
      onChange={vi.fn()}
      placeholder="First editor"
      ref={firstRef}
      value="First"
    />
    <PlateEditorSurface
      activePath="second.md"
      autoFocus
      className="markdown-editor is-focus-editor"
      interactionActive={active === 'second'}
      onChange={vi.fn()}
      placeholder="Second editor"
      ref={secondRef}
      value="Second"
    />
  </>
)

describe('PlateEditorSurface cached route lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not publish snapshots from an inactive cached editor', async () => {
    vi.useFakeTimers()
    const ref = createRef<PlateEditorSurfaceHandle>()
    const onChange = vi.fn()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        interactionActive={false}
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value="Before"
      />,
    )
    const editor = ref.current?.getEditor()

    await act(async () => {
      editor?.tf.select({
        anchor: { offset: 6, path: [0, 0] },
        focus: { offset: 6, path: [0, 0] },
      })
      editor?.tf.insertText(' stale')
      await vi.advanceTimersByTimeAsync(1_000)
    })

    vi.useRealTimers()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves autofocus, focus mode, and the animated caret with the active cached editor', async () => {
    const firstRef = createRef<PlateEditorSurfaceHandle>()
    const secondRef = createRef<PlateEditorSurfaceHandle>()
    const view = render(<SurfacePair active="first" firstRef={firstRef} secondRef={secondRef} />)
    const first = screen.getByLabelText('First editor')
    const second = screen.getByLabelText('Second editor')

    expect(document.activeElement).toBe(first)
    expect(
      document.querySelectorAll('[data-marklab-plate-overlay="animated-cursor"]'),
    ).toHaveLength(1)

    act(() => {
      firstRef.current?.getEditor().tf.select({
        anchor: { offset: 2, path: [0, 0] },
        focus: { offset: 2, path: [0, 0] },
      })
    })
    await waitFor(() => expect(first).toHaveAttribute('data-focus-active', 'true'))

    view.rerender(<SurfacePair active="second" firstRef={firstRef} secondRef={secondRef} />)

    expect(document.activeElement).toBe(second)
    expect(first).not.toHaveAttribute('data-focus-active')
    expect(
      document.querySelectorAll('[data-marklab-plate-overlay="animated-cursor"]'),
    ).toHaveLength(1)

    act(() => firstRef.current?.focus())
    expect(document.activeElement).toBe(second)

    act(() => {
      firstRef.current?.getEditor().tf.select({
        anchor: { offset: 3, path: [0, 0] },
        focus: { offset: 3, path: [0, 0] },
      })
    })
    expect(first).not.toHaveAttribute('data-focus-active')
  })

  it('removes inactive caret listeners immediately during cached tab switches', () => {
    let frameId = 0
    const frames = new Map<number, FrameRequestCallback>()
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        const id = ++frameId
        frames.set(id, callback)
        return id
      })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    const flushFrames = () => {
      const pending = [...frames.values()]
      frames.clear()
      act(() => pending.forEach((callback) => callback(performance.now())))
    }
    const firstRef = createRef<PlateEditorSurfaceHandle>()
    const secondRef = createRef<PlateEditorSurfaceHandle>()
    const view = render(<SurfacePair active="first" firstRef={firstRef} secondRef={secondRef} />)
    const first = screen.getByLabelText('First editor')
    const second = screen.getByLabelText('Second editor')
    const firstCaret = document.querySelector('[data-marklab-plate-overlay="animated-cursor"]')
    flushFrames()

    view.rerender(<SurfacePair active="second" firstRef={firstRef} secondRef={secondRef} />)
    const secondCaret = document.querySelector('[data-marklab-plate-overlay="animated-cursor"]')
    expect(firstCaret).not.toBe(secondCaret)
    expect(firstCaret?.isConnected).toBe(false)
    flushFrames()
    requestFrame.mockClear()

    first.dispatchEvent(new Event('scroll'))
    first.dispatchEvent(new FocusEvent('focus'))
    expect(requestFrame).not.toHaveBeenCalled()

    second.dispatchEvent(new Event('scroll'))
    expect(requestFrame).toHaveBeenCalledOnce()
    flushFrames()

    view.rerender(<SurfacePair active={null} firstRef={firstRef} secondRef={secondRef} />)
    flushFrames()
    requestFrame.mockClear()
    document.dispatchEvent(new Event('selectionchange'))
    first.dispatchEvent(new Event('scroll'))
    second.dispatchEvent(new FocusEvent('focus'))

    expect(requestFrame).not.toHaveBeenCalled()
    expect(document.querySelector('[data-marklab-plate-overlay="animated-cursor"]')).toBeNull()
  })
})
