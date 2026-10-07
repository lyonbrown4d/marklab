import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceNavigationQuery } from '@/components/titlebar/useWorkspaceNavigationQuery'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'

vi.mock('@/services/workspaceAnalysisApi', () => ({
  workspaceAnalysisApi: {
    getKnowledgeSummary: vi.fn(),
    queryNavigation: vi.fn(),
  },
}))

const analysisApi = vi.mocked(workspaceAnalysisApi)

const navigationResult = (activePath: string, text: string) => ({
  ready: true as const,
  revision: 1,
  active_path: activePath,
  files: [],
  headings: [{ path: activePath, slug: text.toLowerCase(), text, level: 2 }],
  file_total: 4,
  heading_total: 1,
  current: {
    headings: [{ path: activePath, slug: 'current', text: `${text} current`, level: 1 }],
    outgoing_links: [],
    backlinks: [],
    missing_links: [],
    heading_total: 1,
    outgoing_link_total: 0,
    backlink_total: 0,
    missing_link_total: 0,
  },
  limit: 24,
})

const knowledgeSummary = {
  ready: true as const,
  revision: 1,
  file_count: 4,
  heading_count: 8,
  internal_link_count: 3,
  linked_file_count: 3,
  missing_link_count: 1,
  orphan_file_count: 1,
  collection_counts: { all: 4, 'needs-attention': 1, linked: 3, structured: 2 },
}

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useWorkspaceNavigationQuery', () => {
  beforeEach(() => {
    analysisApi.queryNavigation.mockReset()
    analysisApi.getKnowledgeSummary.mockReset()
    analysisApi.getKnowledgeSummary.mockResolvedValue(knowledgeSummary)
  })

  it('queries exact deferred heading text and maps navigation to command view models', async () => {
    analysisApi.queryNavigation.mockResolvedValue(navigationResult('notes/current.md', 'Intro'))
    const { result } = renderHook(
      () =>
        useWorkspaceNavigationQuery({
          activePath: 'notes/current.md',
          enabled: true,
          query: 'Intro',
          scope: 'headings',
          workspaceKey: 'external:C:/notes',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(analysisApi.queryNavigation).toHaveBeenCalledWith({
      active_path: 'notes/current.md',
      limit: 24,
      query: 'Intro',
      scope: 'headings',
    })
    expect(result.current.headings).toEqual([
      {
        path: 'notes/current.md',
        slug: 'intro',
        text: 'Intro',
        level: 2,
        label: 'current',
      },
    ])
    expect(result.current.navigationHeadings[0]?.text).toBe('Intro current')
    expect(result.current.indexedFileCount).toBe(4)
    expect(result.current.collectionCounts.structured).toBe(2)
  })

  it('does not let a late response from the previous tab replace current navigation', async () => {
    let resolveOld!: (value: ReturnType<typeof navigationResult>) => void
    analysisApi.queryNavigation
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce(navigationResult('notes/new.md', 'New'))
    const { result, rerender } = renderHook(
      ({ activePath }) =>
        useWorkspaceNavigationQuery({
          activePath,
          enabled: true,
          query: '',
          scope: 'all',
          workspaceKey: 'external:C:/notes',
        }),
      { initialProps: { activePath: 'notes/old.md' }, wrapper: createWrapper() },
    )

    rerender({ activePath: 'notes/new.md' })
    await waitFor(() => expect(result.current.navigationHeadings[0]?.text).toBe('New current'))
    resolveOld(navigationResult('notes/old.md', 'Old'))
    await waitFor(() => expect(analysisApi.queryNavigation).toHaveBeenCalledTimes(2))
    expect(result.current.navigationHeadings[0]?.text).toBe('New current')
  })

  it('skips backend heading work for a file-only query and exposes summary failures', async () => {
    analysisApi.getKnowledgeSummary.mockRejectedValue(new Error('database unavailable'))
    const { result } = renderHook(
      () =>
        useWorkspaceNavigationQuery({
          activePath: 'notes/current.md',
          enabled: true,
          query: 'guide',
          scope: 'files',
          workspaceKey: 'external:C:/notes',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(analysisApi.queryNavigation).not.toHaveBeenCalled()
    expect(result.current.workspaceIndexed).toBe(false)
  })

  it('keeps the summary query active while quick-open navigation is disabled', async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceNavigationQuery({
          activePath: 'notes/current.md',
          enabled: true,
          navigationEnabled: false,
          query: 'body text',
          scope: 'all',
          workspaceKey: 'external:C:/notes',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.workspaceIndexed).toBe(true))
    expect(result.current.indexedFileCount).toBe(4)
    expect(analysisApi.queryNavigation).not.toHaveBeenCalled()
  })
})
