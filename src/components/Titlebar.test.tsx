import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Titlebar from '@/components/Titlebar'
import i18n from '@/i18n/setup'
import { writeClipboardText } from '@/runtime/clipboard'
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
const writeClipboardTextMock = vi.mocked(writeClipboardText)

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
  files: [{ path: 'notes/target.md', kind: 'file' }],
  workspaceIndex,
  canCreateWorkspaceEntries: true,
  searchIndexRebuilding: false,
  isMaximized: false,
  setIsMaximized: vi.fn(),
  theme: 'paper',
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
  writeClipboardTextMock.mockReset()
  writeClipboardTextMock.mockResolvedValue(undefined)
  usePreferencesStore.setState({ locale: 'en-US' })
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
    const indexedOptions = await screen.findAllByRole('option', { name: /Indexed Detail/i })
    await userEvent.click(indexedOptions[0])

    expect(onOpenHeading).toHaveBeenCalledWith('notes/target.md', 'indexed-detail')
  })

  it('copies a markdown link for file results without opening the file', async () => {
    const onOpenFile = vi.fn()
    renderTitlebar(createProps({ commandOpen: true, onOpenFile }))

    await userEvent.click(
      await screen.findByRole('button', {
        name: /Copy Markdown Link notes\/target\.md/i,
      }),
    )

    expect(writeClipboardTextMock).toHaveBeenCalledWith('[target](<notes/target.md>)')
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  it('copies a markdown link with an anchor for heading results', async () => {
    const onOpenHeading = vi.fn()
    renderTitlebar(createProps({ commandOpen: true, onOpenHeading }))

    await userEvent.type(screen.getByRole('combobox'), 'indexed')
    await userEvent.click(
      await screen.findByRole('button', {
        name: /Copy Markdown Link notes\/target\.md#indexed-detail/i,
      }),
    )

    expect(writeClipboardTextMock).toHaveBeenCalledWith(
      '[Indexed Detail](<notes/target.md#indexed-detail>)',
    )
    expect(onOpenHeading).not.toHaveBeenCalled()
  })

  it('opens recently active files from the command palette', async () => {
    const onOpenFile = vi.fn()
    renderTitlebar(
      createProps({
        commandOpen: true,
        files: [{ path: 'notes/target.md', kind: 'file' }],
        tabs: [
          { kind: 'file', path: 'notes/target.md', view: 'edit' },
          { kind: 'file', path: 'docs/spec.pdf', view: 'preview' },
        ],
        onOpenFile,
      }),
    )

    await userEvent.click(await screen.findByRole('option', { name: /spec\.pdf/i }))

    expect(onOpenFile).toHaveBeenCalledWith('docs/spec.pdf')
  })

  it('finds workspace commands by english aliases in localized UI', async () => {
    const onOpenWorkspaceGraph = vi.fn()
    usePreferencesStore.setState({ locale: 'zh-CN' })
    await i18n.changeLanguage('zh-CN')
    renderTitlebar(createProps({ commandOpen: true, onOpenWorkspaceGraph }))

    await userEvent.type(screen.getByRole('combobox'), 'workspace graph')
    await userEvent.click(await screen.findByRole('option', { name: /打开工作区图谱/i }))

    expect(onOpenWorkspaceGraph).toHaveBeenCalled()
  })

  it('keeps previewable file tree entries discoverable when the workspace index is ready', async () => {
    const onOpenFile = vi.fn()
    renderTitlebar(
      createProps({
        files: [
          { path: 'notes/target.md', kind: 'file' },
          { path: 'docs/spec.pdf', kind: 'file' },
        ],
        commandOpen: true,
        onOpenFile,
      }),
    )

    await userEvent.type(screen.getByRole('combobox'), 'spec')
    await userEvent.click(await screen.findByText('docs/spec.pdf'))

    expect(onOpenFile).toHaveBeenCalledWith('docs/spec.pdf')
  })

  it('opens the all pages route from the command palette', async () => {
    const onOpenAllPages = vi.fn()
    renderTitlebar(createProps({ commandOpen: true, onOpenAllPages }))

    await userEvent.click(await screen.findByRole('option', { name: /Open All Pages/i }))

    expect(onOpenAllPages).toHaveBeenCalledWith()
  })

  it('opens markdown collections from the command palette', async () => {
    const onOpenAllPages = vi.fn()
    renderTitlebar(createProps({ commandOpen: true, onOpenAllPages }))

    await userEvent.click(await screen.findByRole('option', { name: /^All pages/i }))

    expect(onOpenAllPages).toHaveBeenCalledWith('all')
  })
  it('labels chrome controls and dispatches titlebar actions', async () => {
    const user = userEvent.setup()
    const props = createProps()

    renderTitlebar(props)

    await user.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    await user.click(screen.getByRole('button', { name: 'Toggle right sidebar' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(props.onToggleSidebar).toHaveBeenCalledTimes(1)
    expect(props.onToggleRightSidebar).toHaveBeenCalledTimes(1)
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('localizes chrome-only controls', async () => {
    usePreferencesStore.setState({ locale: 'zh-CN' })
    await i18n.changeLanguage('zh-CN')

    renderTitlebar(createProps())

    expect(screen.getByRole('button', { name: '切换侧边栏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换右侧栏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多' })).toBeInTheDocument()
  })

  it('announces active file save state from the command center', () => {
    renderTitlebar(
      createProps({
        dirtyPaths: { 'notes/target.md': true },
        silentSave: false,
      }),
    )

    expect(screen.getByRole('button', { name: 'Search files... - target.md' })).toBeInTheDocument()
  })

  it('hides routine dirty state from the command center during silent save', () => {
    renderTitlebar(
      createProps({
        dirtyPaths: { 'notes/target.md': true },
        silentSave: true,
      }),
    )

    expect(screen.getByRole('button', { name: 'Search files... - target.md' })).toBeInTheDocument()
    expect(screen.queryByLabelText('target.md - Unsaved')).not.toBeInTheDocument()
  })
})
