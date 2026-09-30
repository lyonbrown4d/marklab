import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImmersiveTitlebarChrome } from '@/components/ImmersiveTitlebarChrome'

const createProps = () => ({
  activePath: '随笔/与自己协作.md',
  saveStatus: 'saved' as const,
  searchLabel: '搜索文件...',
  savedLabel: '已保存到本机',
  savingLabel: '正在保存到本机',
  unsavedLabel: '尚未保存',
  saveErrorLabel: '保存失败',
  localLibraryLabel: '本地知识库',
  untitledLabel: '未命名文档',
  toggleSidebarLabel: '切换侧边栏',
  toggleOutlineLabel: '文档大纲',
  settingsLabel: '设置',
  viewMode: 'wysiwyg' as const,
  wysiwygLabel: '所见即所得',
  sourceLabel: '源码',
  graphLabel: '思维导图',
  workspaceMenuLabel: '工作区',
  newWorkspaceLabel: '新建工作区',
  openFileLabel: '打开文件',
  newFileLabel: '新建文件',
  exportLabel: '导出',
  exportPdfLabel: '导出为 PDF',
  exportDocxLabel: '导出为 Word',
  onOpenSearch: vi.fn(),
  onToggleSidebar: vi.fn(),
  onToggleOutline: vi.fn(),
  onOpenSettings: vi.fn(),
  onChangeView: vi.fn(),
  onNewWorkspace: vi.fn(),
  onOpenFile: vi.fn(),
  onCreateFile: vi.fn(),
  onExport: vi.fn(),
  onOpenCurrentWorkspaceInNewWindow: vi.fn(),
  onSelectWorkspaceInNewWindow: vi.fn(),
  workspaceWindowOpening: false,
  openCurrentWorkspaceInNewWindowLabel: 'Open Current Workspace in New Window',
  openWorkspaceInNewWindowLabel: 'Open Workspace in New Window…',
})

describe('ImmersiveTitlebarChrome', () => {
  it('keeps document context and local persistence visible without a command bar', async () => {
    const props = createProps()
    render(<ImmersiveTitlebarChrome {...props} />)

    expect(screen.getByText('随笔')).toBeInTheDocument()
    expect(screen.getByText('与自己协作')).toBeInTheDocument()
    expect(screen.getByText('已保存到本机')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '搜索文件...' }))
    await userEvent.click(screen.getByRole('button', { name: '文档大纲' }))
    await userEvent.click(screen.getByRole('button', { name: '设置' }))
    await userEvent.click(screen.getByRole('button', { name: '源码' }))
    await userEvent.click(screen.getByRole('button', { name: '工作区: 随笔' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '新建工作区' }))

    expect(props.onOpenSearch).toHaveBeenCalledOnce()
    expect(props.onToggleOutline).toHaveBeenCalledOnce()
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
    expect(props.onChangeView).toHaveBeenCalledWith('source')
    expect(props.onNewWorkspace).toHaveBeenCalledOnce()
  })

  it('uses a generic local-library context when no document is active', () => {
    render(<ImmersiveTitlebarChrome {...createProps()} activePath={null} />)

    expect(screen.getByText('Marklab')).toBeInTheDocument()
    expect(screen.getByText('本地知识库')).toBeInTheDocument()
    expect(screen.getByText('未命名文档')).toBeInTheDocument()
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

  it('disables new-window actions while one workspace is opening', async () => {
    render(<ImmersiveTitlebarChrome {...createProps()} workspaceWindowOpening />)
    await userEvent.click(screen.getByRole('button', { name: '工作区: 随笔' }))

    expect(
      screen.getByRole('menuitem', { name: 'Open Current Workspace in New Window' }),
    ).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: 'Open Workspace in New Window…' })).toHaveAttribute(
      'data-disabled',
    )
  })
})
