import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GitDiffView from '@/components/GitDiffView'
import i18n from '@/i18n/setup'
import { configureMonaco } from '@/lib/monaco'
import { gitApi } from '@/services/gitApi'
import type { GitFileDiff } from '@/services/gitApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: vi.fn(
    (props: { language?: string; modified?: string; original?: string; theme?: string }) => (
      <div
        data-language={props.language}
        data-modified={props.modified}
        data-original={props.original}
        data-testid="diff-editor"
        data-theme={props.theme}
      />
    ),
  ),
}))

vi.mock('@/hooks/useDarkMode', () => ({
  useDarkMode: () => false,
}))

vi.mock('@/lib/monaco', () => ({
  configureMonaco: vi.fn(),
}))

vi.mock('@/services/gitApi', () => ({
  gitApi: {
    getFileDiff: vi.fn(),
  },
}))

const monacoMock = {} as Awaited<ReturnType<typeof configureMonaco>>

const createDiff = (overrides: Partial<GitFileDiff> = {}): GitFileDiff => ({
  modified_content: '# Updated\n',
  modified_label: 'Worktree',
  old_path: undefined,
  original_content: '# Original\n',
  original_label: 'HEAD',
  path: 'docs/guide.md',
  unified_diff: undefined,
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

const renderDiffView = () => {
  const onClose = vi.fn()
  const onOpenFile = vi.fn()

  render(
    <GitDiffView
      rootPath="D:/Projects/marklab"
      request={{ path: 'docs/guide.md', section: 'unstaged', status: 'modified' }}
      onClose={onClose}
      onOpenFile={onOpenFile}
    />,
    { wrapper: createWrapper() },
  )

  return { onClose, onOpenFile }
}

describe('GitDiffView', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    usePreferencesStore.setState({ locale: 'en-US' })
    await i18n.changeLanguage('en-US')
  })

  it('names file actions and renders the loaded diff region', async () => {
    const user = userEvent.setup()
    vi.mocked(configureMonaco).mockResolvedValue(monacoMock)
    vi.mocked(gitApi.getFileDiff).mockResolvedValue(createDiff())

    const handlers = renderDiffView()

    expect(
      await screen.findByRole('region', { name: 'Git Diff: docs/guide.md' }),
    ).toBeInTheDocument()
    expect(screen.getByText('HEAD ↔ Worktree')).toBeInTheDocument()

    const openButton = screen.getByRole('button', { name: 'Open File: docs/guide.md' })
    const closeButton = screen.getByRole('button', { name: 'Close Diff' })

    expect(openButton).toHaveAttribute('title', 'Open File: docs/guide.md')
    expect(closeButton).toHaveAttribute('title', 'Close Diff')
    expect(screen.getByTestId('diff-editor')).toHaveAttribute('data-language', 'markdown')
    expect(screen.getByTestId('diff-editor')).toHaveAttribute('data-theme', 'vs')

    await user.click(openButton)
    await user.click(closeButton)

    expect(handlers.onOpenFile).toHaveBeenCalledWith('docs/guide.md')
    expect(handlers.onClose).toHaveBeenCalledTimes(1)
  })

  it('announces Git diff loading with decorative skeletons', () => {
    vi.mocked(configureMonaco).mockResolvedValue(monacoMock)
    vi.mocked(gitApi.getFileDiff).mockImplementation(
      () => new Promise<GitFileDiff>(() => undefined),
    )

    renderDiffView()

    const loadingRegion = screen.getByRole('status', { name: 'Git Diff: docs/guide.md' })

    expect(loadingRegion).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })

  it('renders Git diff query errors as alerts', async () => {
    vi.mocked(configureMonaco).mockResolvedValue(monacoMock)
    vi.mocked(gitApi.getFileDiff).mockRejectedValue(new Error('diff failed'))

    renderDiffView()

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('Git Diff')
    expect(alert).toHaveTextContent('diff failed')
  })

  it('renders Monaco load errors as alerts after the diff query succeeds', async () => {
    vi.mocked(configureMonaco).mockRejectedValue(new Error('monaco failed'))
    vi.mocked(gitApi.getFileDiff).mockResolvedValue(createDiff())

    renderDiffView()

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('Failed to load diff editor: monaco failed')
  })

  it('keeps the Monaco loading spinner decorative', async () => {
    vi.mocked(configureMonaco).mockImplementation(() => new Promise(() => undefined))
    vi.mocked(gitApi.getFileDiff).mockResolvedValue(createDiff())

    renderDiffView()

    const loadingText = await screen.findByText(/Loading Markdown/)

    expect(loadingText.closest('[role="status"]')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })
})
