import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import { isPlateDocumentFindShortcut } from '@/components/plate/PlateDocumentFind'
import * as plateDocumentFindModel from '@/components/plate/plateDocumentFindModel'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'editor.find': 'Find in document',
        'editor.findClose': 'Close find',
        'editor.findNext': 'Next match',
        'editor.findPlaceholder': 'Find',
        'editor.findPrevious': 'Previous match',
      })[key] ?? key,
  }),
}))

const rangeRectDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getBoundingClientRect',
)

beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  })
})

afterAll(() => {
  if (rangeRectDescriptor) {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRectDescriptor)
  } else {
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  }
})

const renderEditor = (options: { readOnly?: boolean; value?: string } = {}) => {
  const onChange = vi.fn()
  const ref = createRef<PlateEditorSurfaceHandle>()
  render(
    <PlateEditorSurface
      activePath="notes/find.md"
      onChange={onChange}
      placeholder="Write"
      readOnly={options.readOnly}
      ref={ref}
      value={options.value ?? 'Alpha beta alpha'}
    />,
  )
  return { editor: ref.current!.getEditor(), onChange, ref }
}

describe('PlateEditorSurface document find', () => {
  it.each([
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
  ])('opens with %s+F, highlights matches, and navigates without editing', async (_name, mod) => {
    const user = userEvent.setup()
    const { editor, onChange, ref } = renderEditor()
    const surface = screen.getByTestId('markdown-editor')

    fireEvent.keyDown(surface, { ...mod, key: 'f' })
    const query = screen.getByRole('searchbox', { name: 'Find in document' })
    expect(query).toHaveFocus()

    await user.type(query, 'alpha')
    expect(screen.getByText('1 / 2')).toBeVisible()
    await waitFor(() =>
      expect(document.querySelectorAll('.slate-search_highlight')).toHaveLength(2),
    )

    await user.keyboard('{Enter}')
    expect(editor.selection).toEqual({
      anchor: { offset: 11, path: [0, 0] },
      focus: { offset: 16, path: [0, 0] },
    })
    expect(screen.getByText('2 / 2')).toBeVisible()

    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(editor.selection).toEqual({
      anchor: { offset: 0, path: [0, 0] },
      focus: { offset: 5, path: [0, 0] },
    })
    expect((await ref.current?.getMarkdown())?.trim()).toBe('Alpha beta alpha')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('seeds the query from an expanded selection and restores editor focus on Escape', async () => {
    const user = userEvent.setup()
    const { editor } = renderEditor()
    const surface = screen.getByTestId('markdown-editor')
    act(() => {
      editor.tf.select({
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 5, path: [0, 0] },
      })
    })

    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    const query = screen.getByRole('searchbox', { name: 'Find in document' })
    expect(query).toHaveValue('Alpha')
    expect(screen.getByText('1 / 2')).toBeVisible()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('searchbox', { name: 'Find in document' })).not.toBeInTheDocument()
    await waitFor(() => expect(surface).toHaveFocus())
    await waitFor(() =>
      expect(document.querySelectorAll('.slate-search_highlight')).toHaveLength(0),
    )
  })

  it('closes from a focused navigation button and keeps Escape inside the editor', async () => {
    const user = userEvent.setup()
    const onGraphEscape = vi.fn()
    render(
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') onGraphEscape()
        }}
      >
        <PlateEditorSurface
          activePath="notes/embedded.md"
          onChange={vi.fn()}
          placeholder="Embedded editor"
          value="Alpha beta alpha"
        />
      </div>,
    )
    const surface = screen.getByTestId('markdown-editor')

    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in document' }), {
      target: { value: 'alpha' },
    })
    const next = screen.getByRole('button', { name: 'Next match' })
    await user.click(next)
    expect(next).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('searchbox', { name: 'Find in document' })).toBeNull()
    expect(surface).toHaveFocus()
    expect(onGraphEscape).not.toHaveBeenCalled()
  })

  it('reclaims repeated Mod+F from any find control and selects the query', () => {
    renderEditor()
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    const query = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Find in document' })
    fireEvent.change(query, { target: { value: 'alpha' } })
    const next = screen.getByRole('button', { name: 'Next match' })
    next.focus()
    const repeatedFind = createEvent.keyDown(next, { ctrlKey: true, key: 'f' })

    fireEvent(next, repeatedFind)

    expect(repeatedFind.defaultPrevented).toBe(true)
    expect(query).toHaveFocus()
    expect(query.selectionStart).toBe(0)
    expect(query.selectionEnd).toBe(query.value.length)
  })

  it('rescans once per value version, clamps the index, and never rescans on navigation', async () => {
    const collectMatches = vi.spyOn(plateDocumentFindModel, 'collectPlateDocumentFindMatches')
    const { editor } = renderEditor()
    collectMatches.mockClear()
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in document' }), {
      target: { value: 'alpha' },
    })
    await waitFor(() => expect(screen.getByText('1 / 2')).toBeVisible())
    const scansAfterQuery = collectMatches.mock.calls.filter(
      ([, query]) => query === 'alpha',
    ).length

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Find in document' }), {
      key: 'Enter',
    })
    expect(screen.getByText('2 / 2')).toBeVisible()
    expect(collectMatches.mock.calls.filter(([, query]) => query === 'alpha')).toHaveLength(
      scansAfterQuery,
    )

    act(() => editor.tf.delete({ at: editor.selection! }))

    await waitFor(() => expect(screen.getByText('1 / 1')).toBeVisible())
    expect(collectMatches.mock.calls.filter(([, query]) => query === 'alpha')).toHaveLength(
      scansAfterQuery + 1,
    )
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Find in document' }), {
      key: 'Enter',
    })
    expect(collectMatches.mock.calls.filter(([, query]) => query === 'alpha')).toHaveLength(
      scansAfterQuery + 1,
    )
  })

  it('keeps a moved caret in place while consecutive edits refresh matches', async () => {
    const collectMatches = vi.spyOn(plateDocumentFindModel, 'collectPlateDocumentFindMatches')
    const { editor } = renderEditor()
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in document' }), {
      target: { value: 'alpha' },
    })
    await waitFor(() => expect(screen.getByText('1 / 2')).toBeVisible())
    const scansAfterQuery = collectMatches.mock.calls.filter(
      ([, query]) => query === 'alpha',
    ).length
    act(() => editor.tf.select({ offset: 6, path: [0, 0] }))

    act(() => editor.tf.insertText('x'))
    await waitFor(() =>
      expect(collectMatches.mock.calls.filter(([, query]) => query === 'alpha')).toHaveLength(
        scansAfterQuery + 1,
      ),
    )
    expect(editor.selection).toEqual({
      anchor: { offset: 7, path: [0, 0] },
      focus: { offset: 7, path: [0, 0] },
    })
    act(() => editor.tf.insertText('y'))
    await waitFor(() =>
      expect(collectMatches.mock.calls.filter(([, query]) => query === 'alpha')).toHaveLength(
        scansAfterQuery + 2,
      ),
    )

    expect(editor.api.string([0])).toBe('Alpha xybeta alpha')
    expect(editor.selection).toEqual({
      anchor: { offset: 8, path: [0, 0] },
      focus: { offset: 8, path: [0, 0] },
    })
    expect(screen.getByText('1 / 2')).toBeVisible()
  })

  it('supports read-only documents and leaves Mod+Shift+F for workspace search', async () => {
    renderEditor({ readOnly: true })
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, {
      ctrlKey: true,
      key: 'f',
      shiftKey: true,
    })

    expect(
      isPlateDocumentFindShortcut({
        altKey: false,
        ctrlKey: true,
        key: 'f',
        metaKey: false,
        shiftKey: true,
      }),
    ).toBe(false)
    expect(screen.queryByRole('searchbox', { name: 'Find in document' })).not.toBeInTheDocument()

    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    const query = screen.getByRole('searchbox', { name: 'Find in document' })
    expect(query).toHaveFocus()
    fireEvent.change(query, { target: { value: 'alpha' } })
    expect(screen.getByText('1 / 2')).toBeVisible()
    await waitFor(() =>
      expect(document.querySelectorAll('.slate-search_highlight')).toHaveLength(2),
    )
  })
})
