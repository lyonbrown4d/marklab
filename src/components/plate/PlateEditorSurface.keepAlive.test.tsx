import { act, render, screen, waitFor } from '@testing-library/react'
import { executeFocusedEditCommand } from '@/app/focusedEditCommand'
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

  it('retains unsaved text, selection and independent undo/redo stacks across cached views', async () => {
    const firstRef = createRef<PlateEditorSurfaceHandle>()
    const secondRef = createRef<PlateEditorSurfaceHandle>()
    const view = render(<SurfacePair active="first" firstRef={firstRef} secondRef={secondRef} />)
    const firstEditor = firstRef.current!.getEditor()
    const secondEditor = secondRef.current!.getEditor()
    act(() => {
      firstEditor.tf.select({
        anchor: { offset: 5, path: [0, 0] },
        focus: { offset: 5, path: [0, 0] },
      })
      firstEditor.tf.insertText(' unsaved')
    })
    const selection = structuredClone(firstEditor.selection)
    await waitFor(async () =>
      expect((await firstRef.current?.getMarkdown())?.trim()).toBe('First unsaved'),
    )

    view.rerender(<SurfacePair active="second" firstRef={firstRef} secondRef={secondRef} />)
    act(() => {
      secondEditor.tf.select({
        anchor: { offset: 6, path: [0, 0] },
        focus: { offset: 6, path: [0, 0] },
      })
      secondEditor.tf.insertText(' separate')
    })
    view.rerender(<SurfacePair active={null} firstRef={firstRef} secondRef={secondRef} />)
    view.rerender(<SurfacePair active="first" firstRef={firstRef} secondRef={secondRef} />)
    expect(firstRef.current?.getEditor()).toBe(firstEditor)
    expect(firstEditor.selection).toEqual(selection)
    act(() => firstEditor.undo())
    await waitFor(async () => expect((await firstRef.current?.getMarkdown())?.trim()).toBe('First'))
    act(() => firstEditor.redo())
    await waitFor(async () =>
      expect((await firstRef.current?.getMarkdown())?.trim()).toBe('First unsaved'),
    )

    view.rerender(<SurfacePair active="second" firstRef={firstRef} secondRef={secondRef} />)
    expect(secondRef.current?.getEditor()).toBe(secondEditor)
    await waitFor(async () =>
      expect((await secondRef.current?.getMarkdown())?.trim()).toBe('Second separate'),
    )
    act(() => secondEditor.undo())
    await waitFor(async () =>
      expect((await secondRef.current?.getMarkdown())?.trim()).toBe('Second'),
    )
    expect((await firstRef.current?.getMarkdown())?.trim()).toBe('First unsaved')
  })

  it('routes desktop undo and redo to the active editor and blocks inactive or read-only edits', async () => {
    const firstRef = createRef<PlateEditorSurfaceHandle>()
    const secondRef = createRef<PlateEditorSurfaceHandle>()
    const view = render(<SurfacePair active="first" firstRef={firstRef} secondRef={secondRef} />)
    const firstEditor = firstRef.current!.getEditor()
    const native = vi.fn(() => true)
    act(() => {
      firstEditor.tf.select(firstEditor.api.end([]))
      firstEditor.tf.insertText(' edit')
    })
    act(() => expect(executeFocusedEditCommand('edit.undo', document, native)).toBe(true))
    expect((await firstRef.current!.getMarkdown()).trim()).toBe('First')
    act(() => expect(executeFocusedEditCommand('edit.redo', document, native)).toBe(true))
    expect((await firstRef.current!.getMarkdown()).trim()).toBe('First edit')

    view.rerender(<SurfacePair active="second" firstRef={firstRef} secondRef={secondRef} />)
    act(() => executeFocusedEditCommand('edit.undo', document, native))
    expect((await firstRef.current!.getMarkdown()).trim()).toBe('First edit')
    expect((await secondRef.current!.getMarkdown()).trim()).toBe('Second')
    screen.getByLabelText('First editor').focus()
    act(() => executeFocusedEditCommand('edit.undo', document, native))
    expect((await firstRef.current!.getMarkdown()).trim()).toBe('First edit')
    expect(native).not.toHaveBeenCalled()

    view.unmount()
    const readOnlyRef = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="readonly.md"
        placeholder="Read only"
        onChange={vi.fn()}
        readOnly
        ref={readOnlyRef}
        value="Read only"
      />,
    )
    const editor = readOnlyRef.current!.getEditor()
    act(() => {
      editor.tf.select(editor.api.end([]))
      editor.tf.insertText(' edit')
    })
    screen.getByTestId('markdown-editor').focus()
    act(() => executeFocusedEditCommand('edit.undo', document, native))
    expect((await readOnlyRef.current!.getMarkdown()).trim()).toBe('Read only edit')
    expect(native).not.toHaveBeenCalled()
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
    expect(requestFrame).toHaveBeenCalled()
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
