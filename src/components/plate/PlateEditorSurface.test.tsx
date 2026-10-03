import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import { runPlateEditorShortcut } from '@/components/plate/plateEditorShortcuts'

describe('PlateEditorSurface', () => {
  it('renders Markdown through the Plate editor surface', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'# Heading\n\nParagraph'}
      />,
    )

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-editor-engine', 'plate')
    expect(ref.current?.getEditor().children).toEqual([
      { children: [{ text: 'Heading' }], type: 'h1' },
      { children: [{ text: 'Paragraph' }], type: 'p' },
    ])
  })

  it('provides the drag-and-drop runtime for editable top-level blocks', () => {
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        value={'First\n\nSecond'}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Move block' })).toHaveLength(2)
  })

  it('keeps read-only mode non-editable', () => {
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Read"
        readOnly
        value="Paragraph"
      />,
    )

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('contenteditable', 'false')
  })

  it('switches an existing editor between editable and read-only modes', () => {
    const props = {
      activePath: 'notes/example.md',
      onChange: vi.fn(),
      placeholder: 'Read',
      value: 'Paragraph',
    }
    const { rerender } = render(<PlateEditorSurface {...props} />)

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('contenteditable', 'true')

    rerender(<PlateEditorSurface {...props} readOnly />)

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('contenteditable', 'false')

    rerender(<PlateEditorSurface {...props} />)

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('contenteditable', 'true')
  })

  it('exposes focus and Markdown serialization through its imperative handle', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="**Bold**"
      />,
    )

    act(() => ref.current?.focus())
    fireEvent.focus(screen.getByTestId('markdown-editor'))

    expect(document.activeElement).toBe(screen.getByTestId('markdown-editor'))
    expect((await ref.current?.getMarkdown())?.trim()).toBe('**Bold**')
  })

  it('keeps familiar Mod+B formatting behavior', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="Paragraph"
      />,
    )
    const editor = ref.current?.getEditor()
    expect(editor).toBeDefined()
    act(() => {
      if (editor) editor.tf.select(editor.api.range([])!)
    })

    act(() => {
      if (editor) runPlateEditorShortcut(editor, 'editor.bold')
    })

    expect(editor?.children).toEqual([{ children: [{ bold: true, text: 'Paragraph' }], type: 'p' }])
  })

  it('marks the selected top-level block for focus mode without relying on DOM focus', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        className="markdown-editor is-focus-editor"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'First\n\nSecond'}
      />,
    )
    const surface = screen.getByTestId('markdown-editor')
    const editor = ref.current?.getEditor()

    act(() => {
      editor?.tf.select({
        anchor: { offset: 2, path: [1, 0] },
        focus: { offset: 2, path: [1, 0] },
      })
    })

    await waitFor(() => {
      expect(surface).toHaveAttribute('data-focus-active', 'true')
      const blocks = surface.querySelectorAll(":scope > [data-block-drag-wrapper='true']")
      expect(blocks[0]).not.toHaveAttribute('data-focus-active')
      expect(blocks[1]).toHaveAttribute('data-focus-active', 'true')
    })
  })

  it('renders an animated caret that yields to IME composition', () => {
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
    const flushAnimationFrame = () => {
      const callbacks = [...animationFrames.values()]
      animationFrames.clear()
      act(() => callbacks.forEach((callback) => callback(performance.now())))
    }
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="Paragraph"
      />,
    )
    const surface = screen.getByTestId('markdown-editor')
    const text = surface.querySelector<HTMLElement>('[data-slate-string="true"]')?.firstChild
    expect(text).toBeDefined()
    const range = document.createRange()
    range.setStart(text!, 2)
    range.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    surface.focus()
    document.dispatchEvent(new Event('selectionchange'))
    Object.defineProperty(selection.getRangeAt(0), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 42, height: 20, left: 36, right: 36, top: 22, width: 0 }),
    })
    flushAnimationFrame()

    const caret = document.querySelector<HTMLElement>(
      '[data-marklab-plate-overlay="animated-cursor"]',
    )
    expect(caret).toHaveClass('is-visible')
    expect(surface).toHaveClass('marklab-animated-cursor-host')
    expect(caret?.style.getPropertyValue('--marklab-caret-x')).toBe('35px')
    expect(caret?.style.getPropertyValue('--marklab-caret-y')).toBe('22px')

    fireEvent.compositionStart(surface)
    flushAnimationFrame()
    expect(caret).not.toHaveClass('is-visible')
    fireEvent.compositionEnd(surface)
    flushAnimationFrame()
    expect(caret).toHaveClass('is-visible')
  })

  it('defers external values until an active IME composition finishes', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    const onChange = vi.fn()
    const view = render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value="Before"
      />,
    )
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.focus(surface)
    fireEvent.compositionStart(surface)
    view.rerender(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value="After"
      />,
    )

    expect((await ref.current?.getMarkdown())?.trim()).toBe('Before')
    fireEvent.compositionEnd(surface)
    await waitFor(async () => expect((await ref.current?.getMarkdown())?.trim()).toBe('After'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps Markdown input rules disabled during an IME composition', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value=""
      />,
    )
    const surface = screen.getByTestId('markdown-editor')
    const editor = ref.current?.getEditor()
    expect(editor).toBeDefined()
    act(() => {
      editor?.tf.select({
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 0, path: [0, 0] },
      })
      fireEvent.compositionStart(surface)
      editor?.tf.insertText('#')
      editor?.tf.insertText(' ')
    })

    expect(editor?.children[0]).toMatchObject({ type: 'p', children: [{ text: '# ' }] })
    fireEvent.compositionEnd(surface)
  })

  it('keeps input rules disabled for text committed by compositionend', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value=""
      />,
    )
    const surface = screen.getByTestId('markdown-editor')
    const editor = ref.current?.getEditor()
    expect(editor).toBeDefined()
    act(() => {
      editor?.tf.select({
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 0, path: [0, 0] },
      })
      fireEvent.compositionStart(surface)
      editor?.tf.insertText('#')
      surface.addEventListener('compositionend', () => editor?.tf.insertText(' '), { once: true })
      fireEvent.compositionEnd(surface)
    })

    expect(editor?.children[0]).toMatchObject({ type: 'p', children: [{ text: '# ' }] })
  })
})
