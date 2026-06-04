import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Titlebar from '@/components/Titlebar'
import i18n from '@/i18n/setup'
import { useAppStore } from '@/store/useAppStore'

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

type TitlebarProps = ComponentProps<typeof Titlebar>

const workspaceIndex = {
  files: [
    {
      path: 'notes/target.md',
      headings: [
        {
          path: 'notes/target.md',
          level: 2,
          text: 'Indexed Detail',
          slug: 'indexed-detail',
          line: 4,
        },
      ],
      links: [],
    },
  ],
} satisfies NonNullable<TitlebarProps['workspaceIndex']>

const createProps = (overrides: Partial<TitlebarProps> = {}): TitlebarProps => ({
  activePath: 'notes/target.md',
  activeTab: { kind: 'file', path: 'notes/target.md', view: 'edit' },
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
  onCloseActiveTab: vi.fn(),
  onOpenTerminal: vi.fn(),
  onRebuildSearchIndex: vi.fn(),
  onChangeView: vi.fn(),
  files: [{ path: 'notes/target.md', kind: 'file' }],
  workspaceIndex,
  canCreateWorkspaceEntries: true,
  searchIndexRebuilding: false,
  isMaximized: false,
  setIsMaximized: vi.fn(),
  theme: 'marko-light',
  setTheme: vi.fn(),
  commandOpen: false,
  onCommandOpenChange: vi.fn(),
  onOpenSettings: vi.fn(),
  ...overrides,
})

const renderTitlebar = (props: TitlebarProps) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <Titlebar {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  localStorage.clear()
  useAppStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
})

describe('Titlebar command palette', () => {
  it('opens workspace files from the command palette', async () => {
    const onOpenFile = vi.fn()
    renderTitlebar(createProps({ commandOpen: true, onOpenFile }))

    await userEvent.click(await screen.findByText('notes/target.md'))

    expect(onOpenFile).toHaveBeenCalledWith('notes/target.md')
  })

  it('opens indexed headings from the command palette', async () => {
    const onOpenHeading = vi.fn()
    renderTitlebar(createProps({ commandOpen: true, onOpenHeading }))

    await userEvent.type(screen.getByRole('combobox'), 'indexed')
    await userEvent.click(await screen.findByRole('option', { name: /Indexed Detail/i }))

    expect(onOpenHeading).toHaveBeenCalledWith('notes/target.md', 'indexed-detail')
  })
})
