import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PlateEditorSurface } from '@/components/plate/PlateEditorSurface'

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

const surfaceProps = {
  activePath: 'notes/first.md',
  onChange: vi.fn(),
  placeholder: 'First editor',
  value: 'Alpha beta alpha',
}

describe('PlateEditorSurface find lifecycle', () => {
  it.each([
    ['document identity', { activePath: 'notes/second.md' }],
    ['interaction state', { interactionActive: false }],
    ['content visibility', { contentVisible: false }],
  ])('clears find state and decorations when %s changes', async (_name, nextProps) => {
    const { rerender } = render(<PlateEditorSurface {...surfaceProps} />)
    const surface = screen.getByTestId('markdown-editor')
    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in document' }), {
      target: { value: 'alpha' },
    })
    await waitFor(() =>
      expect(document.querySelectorAll('.slate-search_highlight')).toHaveLength(2),
    )

    rerender(<PlateEditorSurface {...surfaceProps} {...nextProps} />)

    await waitFor(() =>
      expect(screen.queryByRole('searchbox', { name: 'Find in document' })).toBeNull(),
    )
    await waitFor(() =>
      expect(document.querySelectorAll('.slate-search_highlight')).toHaveLength(0),
    )
  })

  it('keeps query and decorations isolated across editor instances', async () => {
    render(
      <>
        <PlateEditorSurface {...surfaceProps} />
        <PlateEditorSurface
          activePath="notes/second.md"
          onChange={vi.fn()}
          placeholder="Second editor"
          value="Beta alpha beta"
        />
      </>,
    )
    const first = screen.getByLabelText('First editor')
    const second = screen.getByLabelText('Second editor')
    const firstShell = first.closest<HTMLElement>('[data-plate-editor-shell="true"]')!
    const secondShell = second.closest<HTMLElement>('[data-plate-editor-shell="true"]')!

    fireEvent.keyDown(first, { ctrlKey: true, key: 'f' })
    fireEvent.change(within(firstShell).getByRole('searchbox', { name: 'Find in document' }), {
      target: { value: 'alpha' },
    })
    expect(within(firstShell).getByText('1 / 2')).toBeVisible()
    expect(within(secondShell).queryByRole('searchbox')).toBeNull()

    fireEvent.keyDown(second, { metaKey: true, key: 'f' })
    fireEvent.change(within(secondShell).getByRole('searchbox', { name: 'Find in document' }), {
      target: { value: 'beta' },
    })

    expect(within(firstShell).getByText('1 / 2')).toBeVisible()
    expect(within(secondShell).getByText('1 / 2')).toBeVisible()
    await waitFor(() => {
      expect(firstShell.querySelectorAll('.slate-search_highlight')).toHaveLength(2)
      expect(secondShell.querySelectorAll('.slate-search_highlight')).toHaveLength(2)
    })
  })

  it('gives real embedded Plate document find priority over graph search', () => {
    const onGraphSearch = vi.fn()
    const onWorkspaceSearch = vi.fn()
    render(
      <div
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return
          if (!event.shiftKey) onGraphSearch()
        }}
        onKeyDownCapture={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === 'f'
          ) {
            onWorkspaceSearch()
          }
        }}
      >
        <PlateEditorSurface {...surfaceProps} />
      </div>,
    )
    const surface = screen.getByTestId('markdown-editor')

    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f' })
    expect(screen.getByRole('searchbox', { name: 'Find in document' })).toHaveFocus()
    expect(onGraphSearch).not.toHaveBeenCalled()

    fireEvent.keyDown(surface, { ctrlKey: true, key: 'f', shiftKey: true })
    expect(onWorkspaceSearch).toHaveBeenCalledOnce()
  })
})
