import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScmPanel from '@/components/ScmPanel'
import i18n from '@/i18n/setup'
import type { GitStatusSnapshot } from '@/services/gitApi'
import { gitApi } from '@/services/gitApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async () => vi.fn()),
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    flushBuffers: vi.fn(),
  },
}))

vi.mock('@/services/gitApi', () => ({
  gitApi: {
    commitAll: vi.fn(),
    getStatus: vi.fn(),
    initRepo: vi.fn(),
  },
}))

const createSnapshot = (overrides: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot => ({
  repo: {
    branch: 'main',
    git_dir: '.git',
    head: 'abc123',
    is_repository: true,
    workdir: 'D:/Projects/marklab',
  },
  conflicts: [],
  staged: [],
  unstaged: [],
  untracked: [],
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })

  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const renderPanel = (props?: Partial<Parameters<typeof ScmPanel>[0]>) => {
  const onOpenDiff = vi.fn()

  render(
    <ScmPanel
      rootPath="D:/Projects/marklab"
      rootKind="internal"
      collapsed={false}
      onOpenDiff={onOpenDiff}
      {...props}
    />,
    { wrapper: createWrapper() },
  )

  return { onOpenDiff }
}

describe('ScmPanel', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    usePreferencesStore.setState({ locale: 'en-US' })
    await i18n.changeLanguage('en-US')
  })

  it('shows a single-file source-control empty state without querying Git', () => {
    renderPanel({ rootKind: 'single', rootPath: 'D:/notes/README.md' })

    expect(screen.getByRole('region', { name: 'Source Control' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="empty"]')).toBeInTheDocument()
    expect(screen.getByText('Source control is unavailable for a single file')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Open a project folder to initialize Git, inspect changes, and commit files.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh Git status' })).not.toBeInTheDocument()
    expect(gitApi.getStatus).not.toHaveBeenCalled()
  })

  it('names the collapsed source-control action with the current change count', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      createSnapshot({
        unstaged: [{ path: 'docs/guide.md', status: 'modified', detail: 'modified' }],
      }),
    )

    renderPanel({ collapsed: true })

    const collapsedButton = await screen.findByRole('button', { name: '1 Git changes' })

    expect(collapsedButton).toHaveAttribute('title', '1 Git changes')
    expect(collapsedButton).toHaveAttribute('aria-busy', 'false')

    await user.click(collapsedButton)

    expect(gitApi.getStatus).toHaveBeenCalledWith('D:/Projects/marklab')
  })

  it('prevents repeated collapsed status refreshes while Git status is fetching', async () => {
    const user = userEvent.setup()
    vi.mocked(gitApi.getStatus).mockImplementation(
      () => new Promise<GitStatusSnapshot>(() => undefined),
    )

    renderPanel({ collapsed: true })

    const collapsedButton = screen.getByRole('button', {
      name: 'This folder is not a Git repository.',
    })

    expect(collapsedButton).toHaveAttribute('aria-busy', 'true')
    expect(collapsedButton).toBeDisabled()

    await user.click(collapsedButton)

    expect(gitApi.getStatus).toHaveBeenCalledTimes(1)
  })

  it('announces loading state without exposing decorative skeletons or spinner labels', () => {
    vi.mocked(gitApi.getStatus).mockImplementation(
      () => new Promise<GitStatusSnapshot>(() => undefined),
    )

    renderPanel()

    const loadingRegion = screen.getByRole('status', { name: 'Checking Git status' })

    expect(loadingRegion).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })

  it('renders Git status errors as alerts', async () => {
    vi.mocked(gitApi.getStatus).mockRejectedValue(new Error('git status failed'))

    renderPanel()

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('Git status is unavailable')
    expect(alert).toHaveTextContent('git status failed')
  })

  it('labels refresh and change groups in the expanded repository panel', async () => {
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      createSnapshot({
        staged: [{ path: 'README.md', status: 'modified', detail: 'modified' }],
        unstaged: [{ path: 'src/App.tsx', status: 'modified', detail: 'modified' }],
      }),
    )

    renderPanel()

    expect(await screen.findByRole('group', { name: 'Staged Changes' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Source Control' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh Git status' })).toHaveAttribute(
      'title',
      'Refresh Git status',
    )
    expect(screen.getByRole('group', { name: 'Changes' })).toBeInTheDocument()
  })

  it('renders a shadcn empty state when the repository is clean', async () => {
    vi.mocked(gitApi.getStatus).mockResolvedValue(createSnapshot())

    renderPanel()

    expect(await screen.findByText('Working tree clean')).toBeInTheDocument()
    expect(screen.getByText('No pending changes')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="empty"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="empty"]')).toHaveAttribute('role', 'status')
    expect(document.querySelector('[data-slot="empty-icon"]')).toBeInTheDocument()
  })

  it('ties conflict commit blocking text to the disabled commit action', async () => {
    vi.mocked(gitApi.getStatus).mockResolvedValue(
      createSnapshot({
        conflicts: [{ path: 'docs/conflict.md', status: 'conflicted', detail: 'both modified' }],
      }),
    )

    renderPanel()

    const commitButton = await screen.findByRole('button', { name: 'Commit all changes' })
    const conflictAlert = screen.getByRole('alert')

    expect(commitButton).toBeDisabled()
    expect(commitButton).toHaveAccessibleDescription('Resolve conflicts before committing.')
    expect(conflictAlert).toHaveTextContent('Resolve conflicts before committing.')
  })
})
