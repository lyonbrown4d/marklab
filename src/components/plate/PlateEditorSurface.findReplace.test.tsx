import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

const workerMocks = vi.hoisted(() => ({ scan: vi.fn(), terminate: vi.fn() }))

vi.mock('@/services/plateDocumentFindWorkerClient', () => ({
  PlateDocumentFindWorkerClient: class {
    scan = workerMocks.scan
    terminate = workerMocks.terminate
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'editor.find': 'Find in document',
        'editor.findClose': 'Close find',
        'editor.findInvalidRegex': 'Invalid regular expression',
        'editor.findMatchCase': 'Match case',
        'editor.findNext': 'Next match',
        'editor.findPlaceholder': 'Find',
        'editor.findPrevious': 'Previous match',
        'editor.findToggleReplace': 'Toggle replace',
        'editor.findUseRegex': 'Use regular expression',
        'editor.findWholeWord': 'Match whole word',
        'editor.replace': 'Replace',
        'editor.replaceAll': 'Replace all',
        'editor.replacePlaceholder': 'Replace',
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

beforeEach(() => {
  workerMocks.scan.mockReset()
  workerMocks.terminate.mockReset()
  workerMocks.scan.mockImplementation(({ query }: { query: string }) =>
    query === '[' ? Promise.reject(new Error('invalidRegex')) : Promise.resolve([]),
  )
})

afterAll(() => {
  if (rangeRectDescriptor) {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRectDescriptor)
  } else {
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  }
})

const renderEditor = (options: { path?: string; readOnly?: boolean } = {}) => {
  const ref = createRef<PlateEditorSurfaceHandle>()
  const view = render(
    <PlateEditorSurface
      activePath={options.path ?? 'notes/find.md'}
      onChange={vi.fn()}
      placeholder="Write"
      readOnly={options.readOnly}
      ref={ref}
      value="Alpha beta alpha"
    />,
  )
  return { ...view, ref }
}

const openFind = () => {
  fireEvent.keyDown(screen.getByTestId('markdown-editor'), { ctrlKey: true, key: 'f' })
  return screen.getByRole('searchbox', { name: 'Find in document' })
}

describe('Plate document find and replace', () => {
  it('replaces all matches as one undoable edit', async () => {
    const user = userEvent.setup()
    const { ref } = renderEditor()
    await user.type(openFind(), 'alpha')
    await user.click(screen.getByRole('button', { name: 'Toggle replace' }))
    await user.type(screen.getByRole('textbox', { name: 'Replace' }), 'omega')

    await user.click(screen.getByRole('button', { name: 'Replace all' }))

    await waitFor(async () =>
      expect((await ref.current?.getMarkdown())?.trim()).toBe('omega beta omega'),
    )
    act(() => ref.current?.getEditor().undo())
    await waitFor(async () =>
      expect((await ref.current?.getMarkdown())?.trim()).toBe('Alpha beta alpha'),
    )
  })

  it('uses matcher options and disables replacement for an invalid expression', async () => {
    const user = userEvent.setup()
    await renderEditor()
    await user.type(openFind(), 'alpha')
    await user.click(screen.getByRole('button', { name: 'Match case' }))
    expect(screen.getByText('1 / 1')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Use regular expression' }))
    await user.clear(screen.getByRole('searchbox', { name: 'Find in document' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in document' }), {
      target: { value: '[' },
    })

    expect(await screen.findByText('Invalid regular expression')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Toggle replace' }))
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled()
  })

  it('allows finding but disables replacement in a read-only document', async () => {
    const user = userEvent.setup()
    renderEditor({ readOnly: true })
    await user.type(openFind(), 'alpha')
    await user.click(screen.getByRole('button', { name: 'Toggle replace' }))

    expect(screen.getByText('1 / 2')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Replace' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled()
  })

  it('discards the find overlay when the active tab changes', async () => {
    const { rerender } = renderEditor()
    fireEvent.change(openFind(), { target: { value: 'alpha' } })

    rerender(
      <PlateEditorSurface
        activePath="notes/second.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="Second document"
      />,
    )

    expect(screen.queryByRole('searchbox', { name: 'Find in document' })).toBeNull()
  })
})
