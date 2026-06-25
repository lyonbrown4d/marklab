import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import Titlebar from '@/components/Titlebar'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

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

type TitlebarProps = ComponentProps<typeof Titlebar>

const workspaceIndex = {
  files: [
    {
      path: 'notes/target.md',
      headings: [
        {
          path: 'notes/target.md',
          level: 2,
          text: 'Current Topic',
          slug: 'current-topic',
          line: 4,
        },
      ],
      links: [
        {
          source_path: 'notes/target.md',
          text: 'Missing Note',
          target: 'missing.md',
          link_type: 'markdown',
          target_path: null,
          target_anchor: null,
          target_heading_slug: null,
          is_external: false,
          context: 'See [Missing Note](missing.md)',
          line: 8,
          column: 5,
        },
      ],
    },
    {
      path: 'notes/source.md',
      headings: [],
      links: [
        {
          source_path: 'notes/source.md',
          text: 'Target',
          target: 'target.md',
          link_type: 'markdown',
          target_path: 'notes/target.md',
          target_anchor: null,
          target_heading_slug: null,
          is_external: false,
          context: 'Backlink context points to Target',
          line: 3,
          column: 7,
        },
      ],
    },
  ],
} satisfies NonNullable<TitlebarProps['workspaceIndex']>

const createProps = (overrides: Partial<TitlebarProps> = {}): TitlebarProps => ({
  activePath: 'notes/target.md',
  activeTab: { kind: 'file', path: 'notes/target.md', view: 'edit' },
  tabs: [],
  dirtyPaths: {},
  saveStates: {},
  silentSave: true,
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
  onCloseActiveTab: vi.fn(),
  onOpenTerminal: vi.fn(),
  onRebuildSearchIndex: vi.fn(),
  onChangeView: vi.fn(),
  files: [
    { path: 'notes/target.md', kind: 'file' },
    { path: 'notes/source.md', kind: 'file' },
  ],
  workspaceIndex,
  canCreateWorkspaceEntries: true,
  searchIndexRebuilding: false,
  isMaximized: false,
  setIsMaximized: vi.fn(),
  theme: 'paper',
  setTheme: vi.fn(),
  commandOpen: true,
  onCommandOpenChange: vi.fn(),
  onOpenSettings: vi.fn(),
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
