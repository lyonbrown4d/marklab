import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import Titlebar from '@/components/Titlebar'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'
import {
  linkedWorkspaceNavigationFixture,
  workspaceKnowledgeSummaryFixture,
} from '@/components/titlebar/workspaceAnalysisTestFixtures'

vi.mock('@/runtime/window', () => ({
  isDesktopRuntime: () => false,
  getCurrentRuntimeWindow: async () => ({
    close: vi.fn(),
    isMaximized: vi.fn(),
    maximize: vi.fn(),
    minimize: vi.fn(),
    startDragging: vi.fn(),
    unmaximize: vi.fn(),
  }),
}))

vi.mock('@/runtime/environment', () => ({
  inferPlatformFromUserAgent: () => 'windows',
  isDesktopRuntime: () => false,
}))

vi.mock('@/runtime/clipboard', () => ({
  readClipboardImagePng: vi.fn(),
  readClipboardText: vi.fn(),
  writeClipboardText: vi.fn(),
}))
vi.mock('@/services/workspaceAnalysisApi', () => ({
  workspaceAnalysisApi: {
    getKnowledgeSummary: vi.fn(),
    queryNavigation: vi.fn(),
  },
}))

type TitlebarProps = ComponentProps<typeof Titlebar>

const analysisApi = vi.mocked(workspaceAnalysisApi)

const createProps = (overrides: Partial<TitlebarProps> = {}): TitlebarProps => ({
  activePath: 'notes/target.md',
  activeTab: { kind: 'file', path: 'notes/target.md', view: 'edit' },
  tabs: [],
  onToggleSidebar: vi.fn(),
  onToggleRightSidebar: vi.fn(),
  onSelectProject: vi.fn(),
  onSelectSingleFile: vi.fn(),
  onCreateFile: vi.fn(),
  onCreateFolder: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenSearchResult: vi.fn(),
  onOpenWorkspaceGraph: vi.fn(),
  onOpenAllPages: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenCurrentWorkspaceInNewWindow: vi.fn(),
  onSelectWorkspaceInNewWindow: vi.fn(),
  onToggleReadOnly: vi.fn(),
  onCloseActiveTab: vi.fn(),
  onOpenTerminal: vi.fn(),
  onRebuildSearchIndex: vi.fn(),
  onChangeView: vi.fn(),
  viewMode: 'wysiwyg',
  files: [
    { path: 'notes/target.md', kind: 'file' },
    { path: 'notes/source.md', kind: 'file' },
    { path: 'notes/resolved.md', kind: 'file' },
  ],
  workspaceKey: 'external:/workspace',
  canCreateWorkspaceEntries: true,
  searchIndexRebuilding: false,
  isMaximized: false,
  setIsMaximized: vi.fn(),
  theme: 'paper',
  setTheme: vi.fn(),
  commandOpen: true,
  onCommandOpenChange: vi.fn(),
  onOpenSettings: vi.fn(),
  recentProjects: [],
  rootPath: '/workspace',
  rootKind: 'external',
  workspaceWindowOpening: false,
  ...overrides,
})

const renderTitlebar = (props: TitlebarProps) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(<Titlebar {...props} />, { wrapper: Wrapper })
}

beforeEach(async () => {
  localStorage.clear()
  usePreferencesStore.setState({ locale: 'en-US' })
  analysisApi.getKnowledgeSummary.mockResolvedValue(workspaceKnowledgeSummaryFixture)
  analysisApi.queryNavigation.mockResolvedValue(linkedWorkspaceNavigationFixture)
  await i18n.changeLanguage('en-US')
})

describe('Titlebar command navigation', () => {
  it('opens current document headings from the command palette', async () => {
    const onOpenHeading = vi.fn()
    renderTitlebar(createProps({ onOpenHeading }))

    const headingOptions = await screen.findAllByRole('option', { name: /Current Topic/i })
    await userEvent.click(headingOptions[0])

    expect(onOpenHeading).toHaveBeenCalledWith('notes/target.md', 'current-topic')
  })

  it('opens outgoing references at target headings when available', async () => {
    const onOpenHeading = vi.fn()
    renderTitlebar(createProps({ onOpenHeading }))

    await userEvent.type(screen.getByRole('combobox'), 'resolved topic')
    await userEvent.click(await screen.findByRole('option', { name: /Resolved Topic/i }))

    expect(onOpenHeading).toHaveBeenCalledWith('notes/resolved.md', 'done')
  })

  it('opens backlink sources as positioned search results', async () => {
    const onOpenSearchResult = vi.fn()
    renderTitlebar(createProps({ onOpenSearchResult }))

    await userEvent.type(screen.getByRole('combobox'), 'backlink context')
    await userEvent.click(
      await screen.findByRole('option', { name: /Backlink context points to Target/i }),
    )

    expect(onOpenSearchResult).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'notes/source.md',
        line: 3,
        column: 7,
        snippet: 'Backlink context points to Target',
      }),
    )
  })

  it('opens missing links as positioned search results', async () => {
    const onOpenSearchResult = vi.fn()
    renderTitlebar(createProps({ onOpenSearchResult }))

    await userEvent.type(screen.getByRole('combobox'), 'missing note')
    await userEvent.click(await screen.findByRole('option', { name: /Missing Note/i }))

    expect(onOpenSearchResult).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'notes/target.md',
        line: 8,
        column: 5,
        snippet: 'See [Missing Note](missing.md)',
      }),
    )
  })
})
