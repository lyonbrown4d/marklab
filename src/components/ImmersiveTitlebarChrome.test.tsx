import { fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImmersiveTitlebarChrome } from '@/components/ImmersiveTitlebarChrome'
import { useNativeSurfaceOcclusionStore } from '@/app/nativeSurfaceOcclusion'
const render = (ui: Parameters<typeof renderTestingLibrary>[0]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderTestingLibrary(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

const createProps = () => ({
  activePath: '随笔/与自己协作.md',
  activeWorkspaceView: 'files' as const,
  searchLabel: '搜索文件...',
  localLibraryLabel: '本地知识库',
  untitledLabel: '未命名文档',
  toggleSidebarLabel: '切换侧边栏',
  toggleOutlineLabel: '文档大纲',
  settingsLabel: '设置',
  viewMode: 'wysiwyg' as const,
  wysiwygLabel: '所见即所得',
  sourceLabel: '源码',
  editorModeLabel: '编辑模式',
  workspaceFilesLabel: '文件',
  workspaceMapLabel: '地图',
  workspaceMapTitle: '工作区地图',
  workspaceViewLabel: '工作区视图',
  moreLabel: '更多操作',
  historyLabel: '工作区历史',
  recentWorkspaces: {
    currentLabel: '当前',
    emptyLabel: '没有最近工作区',
    openLabel: '在新窗口打开工作区：{name}',
    paths: ['D:/随笔', 'D:/写作', 'D:/归档', 'D:/研究', 'D:/不会显示'],
    rootPath: 'D:/随笔',
    rootKind: 'external' as const,
    sectionLabel: '最近打开',
  },
  workspaceMenuLabel: '工作区',
  newWorkspaceLabel: '新建工作区',
  openFileLabel: '打开文件',
  newFileLabel: '新建文件',
  exportLabel: '导出',
  exportPdfLabel: '导出为 PDF',
  exportDocxLabel: '导出为 Word',
  onOpenSearch: vi.fn(),
  onOpenWorkspaceFiles: vi.fn(),
  onOpenWorkspaceGraph: vi.fn(),
  onToggleSidebar: vi.fn(),
  onToggleOutline: vi.fn(),
  onOpenSettings: vi.fn(),
  onChangeView: vi.fn(),
  onNewWorkspace: vi.fn(),
  onOpenFile: vi.fn(),
  onCreateFile: vi.fn(),
  onExport: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenCurrentWorkspaceInNewWindow: vi.fn(),
  onSelectWorkspaceInNewWindow: vi.fn(),
  workspaceWindowOpening: false,
  openCurrentWorkspaceInNewWindowLabel: 'Open Current Workspace in New Window',
  openWorkspaceInNewWindowLabel: 'Open Workspace in New Window…',
})

describe('ImmersiveTitlebarChrome', () => {
  beforeEach(() => useNativeSurfaceOcclusionStore.setState({ reasons: {} }))
  it('keeps document context visible without a command bar', async () => {
    const props = createProps()
    render(<ImmersiveTitlebarChrome {...props} />)

    expect(screen.getByText('随笔')).toBeInTheDocument()
    expect(screen.getByText('与自己协作')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '搜索文件...' }))
    await userEvent.click(screen.getByRole('button', { name: '文档大纲' }))
    await userEvent.click(screen.getByRole('button', { name: '设置' }))
    await userEvent.click(screen.getByRole('radio', { name: '源码' }))
    await userEvent.click(screen.getByRole('button', { name: '工作区: 随笔' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '新建工作区' }))

    expect(props.onOpenSearch).toHaveBeenCalledOnce()
    expect(props.onToggleOutline).toHaveBeenCalledOnce()
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
    expect(props.onChangeView).toHaveBeenCalledWith('source')
    expect(props.onNewWorkspace).toHaveBeenCalledOnce()
  })

  it('switches between workspace files and map beside the workspace menu', async () => {
    const props = createProps()
    const user = userEvent.setup()
    const { rerender } = render(<ImmersiveTitlebarChrome {...props} />)

    await user.click(screen.getByRole('radio', { name: '地图' }))
    expect(props.onOpenWorkspaceGraph).toHaveBeenCalledOnce()

    rerender(<ImmersiveTitlebarChrome {...props} activeWorkspaceView="map" />)
    await user.click(screen.getByRole('radio', { name: '文件' }))
    expect(props.onOpenWorkspaceFiles).toHaveBeenCalledOnce()
  })

  it('shows the workspace map title and hides document-only actions on the map', async () => {
    const props = createProps()
    const user = userEvent.setup()
    render(<ImmersiveTitlebarChrome {...props} activePath={null} activeWorkspaceView="map" />)

    expect(screen.getByText('工作区地图')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '所见即所得' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导出' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '文档大纲' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    expect(screen.queryByRole('menuitem', { name: '所见即所得' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '导出' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '文档大纲' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '搜索文件...' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '设置' })).toBeInTheDocument()
  })

  it('shows the web title without document-only actions', () => {
    render(<ImmersiveTitlebarChrome {...createProps()} activePath={null} webTitle="Example docs" />)

    expect(screen.getByText('Example docs')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '所见即所得' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导出' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '文档大纲' })).not.toBeInTheDocument()
  })

  it('occludes native web content while titlebar dropdowns are open', async () => {
    const user = userEvent.setup()
    render(<ImmersiveTitlebarChrome {...createProps()} />)

    await user.click(screen.getByRole('button', { name: '工作区: 随笔' }))
    expect(useNativeSurfaceOcclusionStore.getState().reasons).toHaveProperty('workspace-menu')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '导出' }))
    expect(useNativeSurfaceOcclusionStore.getState().reasons).toHaveProperty('export-menu')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '更多操作' }))
    expect(useNativeSurfaceOcclusionStore.getState().reasons).toHaveProperty('overflow-menu')
  })

  it('hides the workspace view switch in single-file mode', () => {
    render(
      <ImmersiveTitlebarChrome
        {...createProps()}
        recentWorkspaces={{ ...createProps().recentWorkspaces, rootKind: 'single' }}
      />,
    )

    expect(screen.queryByRole('radio', { name: '文件' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '地图' })).not.toBeInTheDocument()
  })

  it('uses a generic local-library context when no document is active', () => {
    render(<ImmersiveTitlebarChrome {...createProps()} activePath={null} />)

    expect(screen.getByText('Marklab')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '工作区: 随笔' })).toBeInTheDocument()
    expect(screen.getByText('未命名文档')).toBeInTheDocument()
  })

  it('keeps the workspace identity stable when the active document is nested', () => {
    render(
      <ImmersiveTitlebarChrome
        {...createProps()}
        activePath="docs/spec/architecture.md"
        recentWorkspaces={{
          ...createProps().recentWorkspaces,
          rootPath: 'D:/随笔',
        }}
      />,
    )

    expect(screen.getByRole('button', { name: '工作区: 随笔' })).toBeInTheDocument()
    expect(screen.getByText('architecture')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '工作区: docs / spec' })).not.toBeInTheDocument()
  })

  it('offers both explicit new-window workspace actions', async () => {
    const props = createProps()
    render(<ImmersiveTitlebarChrome {...props} />)
    const trigger = screen.getByRole('button', { name: '工作区: 随笔' })

    await userEvent.click(trigger)
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Open Current Workspace in New Window' }),
    )
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open Workspace in New Window…' }))

    expect(props.onOpenCurrentWorkspaceInNewWindow).toHaveBeenCalledOnce()
    expect(props.onSelectWorkspaceInNewWindow).toHaveBeenCalledOnce()
  })

  it('offers a visible export menu for PDF and Word', async () => {
    const props = createProps()
    render(<ImmersiveTitlebarChrome {...props} />)

    const trigger = screen.getByRole('button', { name: '导出' })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menuitem', { name: '导出为 PDF' }))
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menuitem', { name: '导出为 Word' }))

    expect(props.onExport).toHaveBeenNthCalledWith(1, 'pdf')
    expect(props.onExport).toHaveBeenNthCalledWith(2, 'docx')
  })

  it('exposes all recent workspaces from the primary chrome', async () => {
    const props = createProps()
    render(<ImmersiveTitlebarChrome {...props} />)

    await userEvent.click(screen.getByRole('button', { name: '工作区: 随笔' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '工作区历史' }))

    expect(props.onOpenHistory).toHaveBeenCalledOnce()
  })

  it('offers semantic actions through the compact overflow menu', async () => {
    const props = createProps()
    const user = userEvent.setup()
    render(<ImmersiveTitlebarChrome {...props} />)

    expect(screen.getByRole('button', { name: '更多操作' }).parentElement).toHaveClass('lg:hidden')
    expect(screen.getByRole('button', { name: '搜索文件...' }).parentElement).toHaveAttribute(
      'data-slot',
      'wide-titlebar-actions',
    )
    const openMore = () => user.click(screen.getByRole('button', { name: '更多操作' }))

    await openMore()
    await user.click(screen.getByRole('menuitem', { name: '搜索文件...' }))
    await openMore()
    await user.click(screen.getByRole('menuitem', { name: '文档大纲' }))
    await openMore()
    await user.click(screen.getByRole('menuitem', { name: '设置' }))
    await openMore()
    await user.hover(screen.getByRole('menuitem', { name: '所见即所得' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '源码' }))
    await user.keyboard('{Escape}')
    await openMore()
    await user.hover(screen.getByRole('menuitem', { name: '导出' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '导出为 PDF' }))

    expect(props.onOpenSearch).toHaveBeenCalledOnce()
    expect(props.onToggleOutline).toHaveBeenCalledOnce()
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
    expect(props.onChangeView).toHaveBeenCalledWith('source')
    expect(props.onExport).toHaveBeenCalledWith('pdf')
    expect(screen.queryByRole('button', { name: '只读浏览' })).not.toBeInTheDocument()
  })

  it('shows at most four recent workspaces, marks current, and opens an MRU item', async () => {
    const props = createProps()
    render(<ImmersiveTitlebarChrome {...props} />)

    await userEvent.click(screen.getByRole('button', { name: '工作区: 随笔' }))
    const current = screen.getByRole('menuitem', { name: '在新窗口打开工作区：随笔' })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('menuitem', { name: '在新窗口打开工作区：研究' })).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: '在新窗口打开工作区：不会显示' }),
    ).not.toBeInTheDocument()

    await userEvent.click(current)
    expect(props.onOpenProject).toHaveBeenCalledWith('D:/随笔')
  })

  it('supports keyboard entry into the most recent workspace', async () => {
    const props = createProps()
    const user = userEvent.setup()
    render(<ImmersiveTitlebarChrome {...props} />)

    screen.getByRole('button', { name: '工作区: 随笔' }).focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(props.onOpenProject).toHaveBeenCalledWith('D:/随笔')
  })

  it('disables new-window actions while one workspace is opening', async () => {
    render(<ImmersiveTitlebarChrome {...createProps()} workspaceWindowOpening />)
    await userEvent.click(screen.getByRole('button', { name: '工作区: 随笔' }))

    expect(screen.getByRole('menuitem', { name: '在新窗口打开工作区：随笔' })).toHaveAttribute(
      'data-disabled',
    )
    expect(
      screen.getByRole('menuitem', { name: 'Open Current Workspace in New Window' }),
    ).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: 'Open Workspace in New Window…' })).toHaveAttribute(
      'data-disabled',
    )
  })
})
