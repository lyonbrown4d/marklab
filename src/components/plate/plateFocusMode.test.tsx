import { act, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

const renderFocusEditor = (value: string, section = false) => {
  const ref = createRef<PlateEditorSurfaceHandle>()
  render(
    <>
      <PlateEditorSurface
        activePath="notes/focus.md"
        className={`markdown-editor is-focus-editor${section ? ' is-focus-scope-section' : ''}`}
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={value}
      />
      <button type="button">Outside</button>
    </>,
  )
  return {
    editor: ref.current?.getEditor(),
    surface: screen.getByTestId('markdown-editor'),
  }
}

const getBlocks = (surface: HTMLElement) => {
  return surface.querySelectorAll<HTMLElement>(":scope > [data-block-drag-wrapper='true']")
}

describe('Plate focus mode', () => {
  it('keeps a multi-block selection and its nearest context visible', async () => {
    const { editor, surface } = renderFocusEditor('First\n\nSecond\n\nThird')

    act(() => {
      editor?.tf.select({
        anchor: { offset: 1, path: [0, 0] },
        focus: { offset: 2, path: [1, 0] },
      })
    })

    await waitFor(() => {
      const blocks = getBlocks(surface)
      expect(blocks[0]).toHaveAttribute('data-focus-active', 'true')
      expect(blocks[1]).toHaveAttribute('data-focus-active', 'true')
      expect(blocks[1]).toHaveAttribute('data-focus-primary', 'true')
      expect(blocks[2]).toHaveAttribute('data-focus-context', 'true')
    })
  })

  it('focuses the nearest heading section without crossing a peer heading', async () => {
    const markdown = '# First\n\nIntro\n\n## Details\n\nOne\n\nTwo\n\n# Next\n\nEnd'
    const { editor, surface } = renderFocusEditor(markdown, true)

    act(() => {
      editor?.tf.select({
        anchor: { offset: 1, path: [3, 0] },
        focus: { offset: 1, path: [3, 0] },
      })
    })

    await waitFor(() => {
      const blocks = getBlocks(surface)
      expect(blocks[1]).toHaveAttribute('data-focus-context', 'true')
      expect(blocks[2]).toHaveAttribute('data-focus-active', 'true')
      expect(blocks[3]).toHaveAttribute('data-focus-primary', 'true')
      expect(blocks[4]).toHaveAttribute('data-focus-active', 'true')
      expect(blocks[5]).toHaveAttribute('data-focus-context', 'true')
      expect(blocks[6]).not.toHaveAttribute('data-focus-active')
    })
  })

  it('restores the document when focus moves outside the editor', async () => {
    const { editor, surface } = renderFocusEditor('First\n\nSecond')
    surface.focus()
    act(() => {
      editor?.tf.select({
        anchor: { offset: 1, path: [0, 0] },
        focus: { offset: 1, path: [0, 0] },
      })
    })
    await waitFor(() => expect(surface).toHaveAttribute('data-focus-active', 'true'))

    screen.getByRole('button', { name: 'Outside' }).focus()

    await waitFor(() => {
      expect(surface).not.toHaveAttribute('data-focus-active')
      getBlocks(surface).forEach((block) => {
        expect(block).not.toHaveAttribute('data-focus-active')
        expect(block).not.toHaveAttribute('data-focus-context')
      })
    })
  })
})
