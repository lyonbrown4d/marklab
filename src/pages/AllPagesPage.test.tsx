import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AllPagesPage from '@/pages/AllPagesPage'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'

const context = vi.hoisted(() => ({
  value: {
    onOpenFile: vi.fn(),
    rootKind: 'external' as const,
    rootPath: 'C:/notes',
  },
}))

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: never) => unknown) => selector(context.value as never),
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('@/services/workspaceAnalysisApi', () => ({
  workspaceAnalysisApi: {
    getKnowledgeSummary: vi.fn(),
    queryAllPages: vi.fn(),
  },
}))

const analysisApi = vi.mocked(workspaceAnalysisApi)
const pageResult = {
  ready: true as const,
  revision: 1,
  items: [
    {
      path: 'notes/first.md',
      title: 'first.md',
      folder: 'notes',
      heading_count: 0,
      link_count: 0,
      asset_count: 0,
      issue_count: 0,
    },
  ],
  folders: ['notes'],
  total: 1,
  offset: 0,
  limit: 500,
}
const summary = {
  ready: true as const,
  revision: 1,
  file_count: 1,
  heading_count: 0,
  internal_link_count: 0,
  linked_file_count: 0,
  missing_link_count: 0,
  orphan_file_count: 1,
  collection_counts: { all: 1, 'needs-attention': 0, linked: 0, structured: 0 },
}

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <AllPagesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, client }
}

describe('AllPagesPage', () => {
  beforeEach(() => {
    context.value.rootPath = 'C:/notes'
    analysisApi.getKnowledgeSummary.mockReset()
    analysisApi.queryAllPages.mockReset()
    analysisApi.getKnowledgeSummary.mockResolvedValue(summary)
    analysisApi.queryAllPages.mockResolvedValue(pageResult)
  })

  it('presents a compact workspace library instead of a dashboard hero', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'allPages.title' })).toBeInTheDocument()
    expect(
      await screen.findByRole('searchbox', { name: 'allPages.searchPlaceholder' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('allPages.eyebrow')).not.toBeInTheDocument()
    expect(screen.queryByText('allPages.description')).not.toBeInTheDocument()
    expect(screen.queryByText('allPages.filtersDescription')).not.toBeInTheDocument()
  })

  it('shows an explicit loading state while page summaries are loading', () => {
    analysisApi.queryAllPages.mockReturnValue(new Promise(() => undefined))

    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('allPages.loadingTitle')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('shows query errors and retries on request', async () => {
    analysisApi.queryAllPages.mockRejectedValue(new Error('index failed'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('allPages.errorTitle')
    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }))
    await waitFor(() => expect(analysisApi.queryAllPages).toHaveBeenCalledTimes(2))
  })

  it('keeps stale page summaries available when a background refresh fails', async () => {
    const { client } = renderPage()
    expect(await screen.findByText('notes/first.md')).toBeInTheDocument()
    analysisApi.queryAllPages.mockRejectedValue(new Error('refresh failed'))

    await client.invalidateQueries({ queryKey: ['workspace-pages', 'external:C:/notes'] })

    expect(await screen.findByRole('alert')).toHaveTextContent('allPages.errorTitle')
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByText('notes/first.md')).toBeInTheDocument()
  })

  it('renders an empty state from bounded backend results', async () => {
    analysisApi.queryAllPages.mockResolvedValueOnce({ ...pageResult, items: [], total: 0 })
    renderPage()

    expect(await screen.findByText('allPages.emptyTitle')).toBeInTheDocument()
  })
})
