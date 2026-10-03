import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

describe('PlateEditorSurface IME synchronization', () => {
  it('commits IME text before considering a pending external value and blur', async () => {
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
    const editor = ref.current?.getEditor()
    expect(editor).toBeDefined()

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
    surface.addEventListener(
      'compositionend',
      () => {
        editor?.tf.select({
          anchor: { offset: 'Before'.length, path: [0, 0] },
          focus: { offset: 'Before'.length, path: [0, 0] },
        })
        editor?.tf.insertText('!')
      },
      { once: true },
    )

    fireEvent.compositionEnd(surface)
    fireEvent.blur(surface)

    await waitFor(async () => expect((await ref.current?.getMarkdown())?.trim()).toBe('Before!'))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls.at(-1)?.[0].trim()).toBe('Before!')
  })
})
