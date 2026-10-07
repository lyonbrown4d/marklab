import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspacePagesQuery } from '@/pages/all-pages/useWorkspacePagesQuery'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'
import { defaultAllPagesFilters } from '@/logic/allPages'

vi.mock('@/services/workspaceAnalysisApi', () => ({
  workspaceAnalysisApi: {
    getKnowledgeSummary: vi.fn(),
    queryAllPages: vi.fn(),
  },
}))

const analysisApi = vi.mocked(workspaceAnalysisApi)
const summary = {
  ready: true as const,
  revision: 1,
  file_count: 2,
  heading_count: 4,
  internal_link_count: 1,
  linked_file_count: 1,
  missing_link_count: 1,
  orphan_file_count: 1,
  collection_counts: { all: 2, 'needs-attention': 1, linked: 1, structured: 1 },
}

const pageResult = (path: string) => ({
  ready: true as const,
  revision: 1,
  items: [
    {
      path,
      title: path.includes('new') ? 'New note' : 'Old note',
      folder: 'notes',
      heading_count: 3,
      link_count: 1,
      asset_count: 2,
      issue_count: 1,
    },
  ],
  folders: ['notes'],
  total: 1,
  offset: 0,
  limit: 500,
})

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useWorkspacePagesQuery', () => {
  beforeEach(() => {
    analysisApi.getKnowledgeSummary.mockReset()
    analysisApi.queryAllPages.mockReset()
    analysisApi.getKnowledgeSummary.mockResolvedValue(summary)
  })

  it('queries bounded page summaries and maps them to all-pages rows', async () => {
    analysisApi.queryAllPages.mockResolvedValue(pageResult('notes/new.md'))
    const { result } = renderHook(
      () =>
        useWorkspacePagesQuery({
          collectionId: 'all',
          filters: { ...defaultAllPagesFilters, query: 'new', sort: 'issues' },
          workspaceKey: 'external:C:/notes',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(analysisApi.queryAllPages).toHaveBeenCalledWith({
      folder: 'all',
      issues_only: false,
      query: 'new',
      sort: 'issues',
    })
    expect(result.current.rows).toEqual([
      {
        assets: 2,
        folder: 'notes',
        headings: 3,
        indexed: true,
        issues: 1,
        links: 1,
        path: 'notes/new.md',
        title: 'New note',
      },
    ])
    expect(result.current.collections.find(({ id }) => id === 'linked')?.count).toBe(1)
  })

  it('applies collection filters without requesting the full workspace index', async () => {
    analysisApi.queryAllPages.mockResolvedValue({
      ...pageResult('notes/linked.md'),
      items: [
        pageResult('notes/linked.md').items[0],
        { ...pageResult('notes/orphan.md').items[0], path: 'notes/orphan.md', link_count: 0 },
      ],
      total: 2,
    })
    const { result } = renderHook(
      () =>
        useWorkspacePagesQuery({
          collectionId: 'linked',
          filters: defaultAllPagesFilters,
          workspaceKey: 'external:C:/notes',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows.map(({ path }) => path)).toEqual(['notes/linked.md'])
  })

  it('isolates late page results by workspace key', async () => {
    let resolveOld!: (value: ReturnType<typeof pageResult>) => void
    analysisApi.queryAllPages
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce(pageResult('notes/new.md'))
    const { result, rerender } = renderHook(
      ({ workspaceKey }) =>
        useWorkspacePagesQuery({
          collectionId: 'all',
          filters: defaultAllPagesFilters,
          workspaceKey,
        }),
      { initialProps: { workspaceKey: 'external:C:/old' }, wrapper: createWrapper() },
    )

    rerender({ workspaceKey: 'external:C:/new' })
    await waitFor(() => expect(result.current.rows[0]?.path).toBe('notes/new.md'))
    resolveOld(pageResult('notes/old.md'))
    await waitFor(() => expect(analysisApi.queryAllPages).toHaveBeenCalledTimes(2))
    expect(result.current.rows[0]?.path).toBe('notes/new.md')
  })
})
