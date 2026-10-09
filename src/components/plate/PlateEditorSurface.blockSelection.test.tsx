import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import { getFocusedTopLevelBlockId } from '@/components/plate/selection/plateBlockSelection'

describe('PlateEditorSurface block selection keyboard behavior', () => {
  it('moves the caret block with Alt+ArrowDown from the editable surface', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/blocks.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'First\n\nSecond\n\nThird'}
      />,
    )
    const editor = ref.current!.getEditor()
    const editable = screen.getByTestId('markdown-editor')
    await waitFor(() => expect(editable).toHaveAttribute('data-state', 'ready'))
    expect(editor.children[1]?.id).toEqual(expect.any(String))
    act(() => editor.tf.select(editor.api.start([1])))
    expect(getFocusedTopLevelBlockId(editor)).toBe(editor.children[1]?.id)

    const wasNotCancelled = fireEvent.keyDown(editable, {
      altKey: true,
      key: 'ArrowDown',
    })

    expect(wasNotCancelled).toBe(false)
    expect(editor.selection?.focus.path[0]).toBe(2)
    expect(editor.children.map((node) => node.children[0]?.text)).toEqual([
      'First',
      'Third',
      'Second',
    ])
  })

  it('does not move text blocks while an IME key event is composing', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/ime-blocks.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'First\n\nSecond\n\nThird'}
      />,
    )
    const editor = ref.current!.getEditor()
    const editable = screen.getByTestId('markdown-editor')
    await waitFor(() => expect(editable).toHaveAttribute('data-state', 'ready'))
    act(() => editor.tf.select(editor.api.start([1])))
    const event = new KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
    })
    Object.defineProperty(event, 'isComposing', { value: true })

    act(() => editable.dispatchEvent(event))

    expect(editor.children.map((node) => node.children[0]?.text)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })
})
