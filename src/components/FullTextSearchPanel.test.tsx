import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FullTextSearchPanel from '@/components/FullTextSearchPanel'
import { fsApi } from '@/services/fsApi'

const messages: Record<string, string> = {
  'search.fullText': 'Full text',
  'search.minQuery': 'Type at least 2 characters',
  'search.noResults': 'No results',
  'search.searching': 'Searching',
  'search.failed': 'Search failed',
  'actions.retry': 'Retry',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    searchWorkspace: vi.fn(),
  },
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    className,
    viewportClassName,
  }: {
    children: ReactNode
    className?: string
    viewportClassName?: string
  }) => (
    <section className={className} data-viewport-class={viewportClassName}>
      {children}
    </section>
  ),
}))

const renderPanel = (query: string, workspaceKey = 'external:/workspace-a') => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <FullTextSearchPanel query={query} workspaceKey={workspaceKey} onOpenResult={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('FullTextSearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('announces initial full text search loading while keeping spinner and skeletons decorative', async () => {
    vi.mocked(fsApi.searchWorkspace).mockReturnValue(new Promise(() => undefined))

    const { container } = renderPanel('notes')

    await waitFor(() => {
      expect(fsApi.searchWorkspace).toHaveBeenCalledWith('notes', 20)
    })

    const loadingStatus = screen.getByRole('status', { name: 'Searching' })
    expect(loadingStatus).toHaveAttribute('aria-busy', 'true')

    const skeletons = container.querySelectorAll('[data-slot="full-text-search-skeleton"]')
    expect(skeletons).toHaveLength(3)
    skeletons.forEach((skeleton) => {
      expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    })

    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('shows a retry action when the sidecar search fails', async () => {
    vi.mocked(fsApi.searchWorkspace)
      .mockRejectedValueOnce(new Error('sidecar failed'))
      .mockResolvedValueOnce([])

    renderPanel('notes')

    expect(await screen.findByRole('heading', { name: 'Search failed' })).toBeInTheDocument()
    screen.getByRole('button', { name: 'Retry' }).click()

    await waitFor(() => expect(fsApi.searchWorkspace).toHaveBeenCalledTimes(2))
  })
})
