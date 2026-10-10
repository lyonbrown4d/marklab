import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnlinkedMentions } from '@/components/useUnlinkedMentions'
import { fsApi } from '@/services/fsApi'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/fsApi', () => ({
  fsApi: {
    searchWorkspaceOccurrences: vi.fn(),
    cancelWorkspaceOccurrenceSearch: vi.fn(async () => ({ cancelled: true })),
  },
}))

const search = vi.mocked(fsApi.searchWorkspaceOccurrences)
const cancel = vi.mocked(fsApi.cancelWorkspaceOccurrenceSearch)

const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('useUnlinkedMentions', () => {
  beforeEach(() => {
    search.mockReset()
    cancel.mockClear()
  })

  it('queries the cancellable occurrence index and maps plain-text matches', async () => {
    search.mockResolvedValue({
      requestId: 'response',
      results: [
        {
          path: 'source.md',
          title: 'Source',
          line: 2,
          column: 5,
          end_column: 11,
          snippet: 'See Target here',
          snippet_highlights: [{ start: 4, end: 10 }],
          score: 1,
        },
      ],
      totalHits: 1,
      scannedDocuments: 2,
      truncated: false,
    })

    const { result } = renderHook(
      () =>
        useUnlinkedMentions({
          backlinks: [],
          enabled: true,
          targetLabel: 'Target',
          targetPath: 'target.md',
          workspaceKey: 'external:/wiki',
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.mentions).toHaveLength(1))
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Target',
        options: { caseSensitive: false, wholeWord: true, useRegex: false },
      }),
    )
    expect(result.current.mentions[0]).toMatchObject({ sourcePath: 'source.md', line: 2 })
  })

  it('cancels the backend request when the consumer unmounts', async () => {
    search.mockReturnValue(new Promise(() => undefined))
    const { unmount } = renderHook(
      () =>
        useUnlinkedMentions({
          backlinks: [],
          enabled: true,
          targetLabel: 'Target',
          targetPath: 'target.md',
          workspaceKey: 'external:/wiki',
        }),
      { wrapper },
    )
    await waitFor(() => expect(search).toHaveBeenCalled())
    const requestId = search.mock.calls.at(-1)?.[0].requestId

    unmount()

    await waitFor(() => expect(cancel).toHaveBeenCalledWith(requestId))
  })
})
