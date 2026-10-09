import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DndPlugin, onDropNode } from '@platejs/dnd'
import type { TElement } from 'platejs'
import { createPlateEditor } from 'platejs/react'
import { createRef } from 'react'
import type { DropTargetMonitor } from 'react-dnd'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'

const paragraph = (id: string, text: string): TElement => ({
  children: [{ text }],
  id,
  type: 'p',
})

const dropMonitor = (canDrop = true) =>
  ({
    canDrop: () => canDrop,
    getClientOffset: () => ({ x: 20, y: 75 }),
  }) as unknown as DropTargetMonitor

const dropTargetRef = {
  current: { getBoundingClientRect: () => new DOMRect(0, 0, 100, 100) },
}

const emptyDataTransfer = {
  files: [],
  getData: () => '',
  items: [],
  types: [],
}

const createDropEditor = () => {
  const value = [paragraph('first', 'First'), paragraph('second', 'Second')]
  return createPlateEditor({ plugins: createPlateEditorPlugins(), value })
}

describe('Plate drag-and-drop integration', () => {
  it('disables the window-scoped plugin scroller', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'First\n\nSecond'}
      />,
    )

    const options = ref.current?.getEditor().getOptions(DndPlugin)

    expect(options?.enableScroller).toBe(false)
  })

  it('anchors edge auto-scroll to the editor shell instead of the window', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'First\n\nSecond'}
      />,
    )
    const editorElement = screen.getByTestId('markdown-editor')
    const scrollBy = vi.fn()
    Object.defineProperty(editorElement, 'scrollBy', { configurable: true, value: scrollBy })

    act(() => ref.current?.getEditor().setOption(DndPlugin, 'isDragging', true))
    const topArea = await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[data-plate-dnd-scroll-area="top"]'),
      ).toBeInTheDocument(),
    ).then(() => document.querySelector<HTMLElement>('[data-plate-dnd-scroll-area="top"]')!)

    expect(screen.getByTestId('plate-editor-shell')).toHaveClass('relative')
    expect(topArea).toHaveStyle({ position: 'absolute', top: '0px' })

    fireEvent.dragOver(editorElement, { clientY: 1, dataTransfer: emptyDataTransfer })
    expect(scrollBy).not.toHaveBeenCalled()

    vi.spyOn(topArea, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 200, 800, 72))
    const dragOverEvent = createEvent.dragOver(topArea, {
      dataTransfer: emptyDataTransfer,
    })
    Object.defineProperty(dragOverEvent, 'clientY', { value: 210 })
    fireEvent(topArea, dragOverEvent)
    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith(0, expect.any(Number)))
    fireEvent.dragLeave(topArea, { dataTransfer: emptyDataTransfer })
  })

  it('keeps edge auto-scroll scoped to the active editor when multiple editors mount', async () => {
    const firstRef = createRef<PlateEditorSurfaceHandle>()
    const secondRef = createRef<PlateEditorSurfaceHandle>()
    render(
      <>
        <PlateEditorSurface
          activePath="notes/first.md"
          onChange={vi.fn()}
          placeholder="First editor"
          ref={firstRef}
          value="First"
        />
        <PlateEditorSurface
          activePath="notes/second.md"
          onChange={vi.fn()}
          placeholder="Second editor"
          ref={secondRef}
          value="Second"
        />
      </>,
    )

    act(() => firstRef.current?.getEditor().setOption(DndPlugin, 'isDragging', true))
    await waitFor(() =>
      expect(document.querySelectorAll('[data-plate-dnd-scroll-area]')).toHaveLength(2),
    )

    const firstShell = screen.getByLabelText('First editor').closest('[data-plate-editor-shell]')
    const secondShell = screen.getByLabelText('Second editor').closest('[data-plate-editor-shell]')
    expect(firstShell?.querySelectorAll('[data-plate-dnd-scroll-area]')).toHaveLength(2)
    expect(secondShell?.querySelectorAll('[data-plate-dnd-scroll-area]')).toHaveLength(0)
  })

  it('keeps the onDropNode dependency contract for a successful drop', () => {
    const editor = createDropEditor()
    const [first, second] = editor.children as TElement[]

    onDropNode(editor, {
      dragItem: { editor, editorId: editor.id, element: first, id: first.id as string },
      element: second,
      monitor: dropMonitor(),
      nodeRef: dropTargetRef,
      orientation: 'vertical',
    })

    expect(editor.children.map((node) => node.children[0]?.text)).toEqual(['Second', 'First'])
  })

  it('keeps the onDropNode dependency contract for a cancelled drop', () => {
    const editor = createDropEditor()
    const [first, second] = editor.children as TElement[]

    onDropNode(editor, {
      dragItem: { editor, editorId: editor.id, element: first, id: first.id as string },
      element: second,
      monitor: dropMonitor(false),
      nodeRef: dropTargetRef,
      orientation: 'vertical',
    })

    expect(editor.children.map((node) => node.children[0]?.text)).toEqual(['First', 'Second'])
  })
})
