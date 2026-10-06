import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AllPagesPage from '@/pages/AllPagesPage'
import type { FsWorkspaceIndex } from '@/services/fsApi'

const context = vi.hoisted(() => ({
  value: {
    files: [{ kind: 'file', path: 'notes/first.md' }],
    onOpenFile: vi.fn(),
    onRetryWorkspaceIndex: vi.fn(),
    workspaceIndex: null as FsWorkspaceIndex | null,
    workspaceIndexError: null as unknown,
    workspaceIndexLoading: false,
  },
}))

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: never) => unknown) => selector(context.value as never),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('AllPagesPage', () => {
  beforeEach(() => {
    context.value.files = [{ kind: 'file', path: 'notes/first.md' }]
    context.value.onRetryWorkspaceIndex.mockReset()
    context.value.workspaceIndex = null
    context.value.workspaceIndexError = null
    context.value.workspaceIndexLoading = false
  })

  it('presents a compact workspace library instead of a dashboard hero', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <AllPagesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'allPages.title' })).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'allPages.searchPlaceholder' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('allPages.eyebrow')).not.toBeInTheDocument()
    expect(screen.queryByText('allPages.description')).not.toBeInTheDocument()
    expect(screen.queryByText('allPages.filtersDescription')).not.toBeInTheDocument()
  })

  it('shows an explicit loading state while the workspace index is loading', () => {
    context.value.workspaceIndexLoading = true

    render(
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <AllPagesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('allPages.loadingTitle')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('shows index errors and retries on request', () => {
    context.value.workspaceIndexError = new Error('index failed')

    render(
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <AllPagesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('allPages.errorTitle')
    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }))
    expect(context.value.onRetryWorkspaceIndex).toHaveBeenCalledOnce()
  })

  it('keeps stale indexed pages available when a background refresh fails', () => {
    context.value.workspaceIndex = {
      files: [{ path: 'notes/first.md', assets: [], headings: [], links: [] }],
    }
    context.value.workspaceIndexError = new Error('refresh failed')

    render(
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <AllPagesPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('allPages.errorTitle')
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByText('notes/first.md')).toBeInTheDocument()
  })

  it('renders the empty and success states after indexing completes', () => {
    context.value.files = []
    const { rerender } = render(
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <AllPagesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('allPages.emptyTitle')).toBeInTheDocument()

    context.value.files = [{ kind: 'file', path: 'notes/first.md' }]
    rerender(
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <AllPagesPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByText('notes/first.md')).toBeInTheDocument()
  })
})
