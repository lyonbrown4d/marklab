import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { flushEditorChangesForClose } from '@/app/editorCloseLifecycle'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

describe('PlateEditorSurface close lifecycle', () => {
  it('persists the current editor tree when closing during IME composition', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    const onChange = vi.fn()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value=""
      />,
    )
    const surface = screen.getByTestId('markdown-editor')
    const editor = ref.current?.getEditor()

    act(() => {
      editor?.tf.select({
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 0, path: [0, 0] },
      })
      fireEvent.compositionStart(surface)
      editor?.tf.insertText('未确认输入')
    })
    expect(onChange).not.toHaveBeenCalled()

    await flushEditorChangesForClose()

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0]?.[0]).toContain('未确认输入')
  })
})
