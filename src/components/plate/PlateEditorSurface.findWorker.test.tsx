import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import type { PlateDocumentFindWorkerMatch } from '@/workers/plateDocumentFindWorkerProtocol'

const workerMocks = vi.hoisted(() => ({
  scan: vi.fn(),
  terminate: vi.fn(),
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
        'editor.findComputing': 'Computing matches',
        'editor.findInvalidRegex': 'Invalid regular expression',
        'editor.findMatchCase': 'Match case',
        'editor.findNext': 'Next match',
        'editor.findPlaceholder': 'Find',
        'editor.findPrevious': 'Previous match',
        'editor.findScanFailed': 'Unable to search this expression',
        'editor.findToggleReplace': 'Toggle replace',
        'editor.findUseRegex': 'Use regular expression',
        'editor.findWholeWord': 'Match whole word',
      })[key] ?? key,
  }),
}))

type Deferred = {
  promise: Promise<PlateDocumentFindWorkerMatch[]>
  resolve: (matches: PlateDocumentFindWorkerMatch[]) => void
  reject: (error: Error) => void
}

const deferred = (): Deferred => {
  let resolve!: Deferred['resolve']
  let reject!: Deferred['reject']
  const promise = new Promise<PlateDocumentFindWorkerMatch[]>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, reject, resolve }
}

const match = (offset: number): PlateDocumentFindWorkerMatch => ({
  anchor: { offset, path: [0, 0] },
  focus: { offset: offset + 5, path: [0, 0] },
  regex: { captures: [], groups: {}, match: 'alpha', prefix: '', suffix: '' },
})

const renderEditor = () => {
  const ref = createRef<PlateEditorSurfaceHandle>()
  render(
    <PlateEditorSurface
      activePath="notes/find-worker.md"
      onChange={vi.fn()}
      placeholder="Write"
      ref={ref}
      value="Alpha beta alpha"
    />,
  )
  fireEvent.keyDown(screen.getByTestId('markdown-editor'), { ctrlKey: true, key: 'f' })
  const query = screen.getByRole('searchbox', { name: 'Find in document' })
  fireEvent.change(query, { target: { value: 'alpha' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }))
  return query
}

describe('Plate document find worker states', () => {
  beforeEach(() => {
    workerMocks.scan.mockReset()
    workerMocks.terminate.mockReset()
  })

  it('shows computing and worker failure states for regular-expression searches', async () => {
    const scan = deferred()
    workerMocks.scan.mockReturnValueOnce(scan.promise)
    renderEditor()

    expect(await screen.findByRole('status', { name: 'Computing matches' })).toBeVisible()
    scan.reject(new Error('scanFailed'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to search this expression')
    expect(screen.queryByRole('status', { name: 'Computing matches' })).toBeNull()
  })

  it('aborts an obsolete request and ignores its late result', async () => {
    const stale = deferred()
    const current = deferred()
    workerMocks.scan.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise)
    const query = renderEditor()
    await waitFor(() => expect(workerMocks.scan).toHaveBeenCalledTimes(1))
    const firstSignal = workerMocks.scan.mock.calls[0]?.[1] as AbortSignal

    fireEvent.change(query, { target: { value: 'beta' } })
    await waitFor(() => expect(workerMocks.scan).toHaveBeenCalledTimes(2))
    expect(firstSignal.aborted).toBe(true)

    current.resolve([match(6)])
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeVisible())
    stale.resolve([match(0), match(11)])
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeVisible())
  })
})
