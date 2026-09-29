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
  onOpenSearch: vi.fn(),
  onToggleSidebar: vi.fn(),
  onToggleOutline: vi.fn(),
  onOpenSettings: vi.fn(),
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

    expect(props.onOpenSearch).toHaveBeenCalledOnce()
    expect(props.onToggleOutline).toHaveBeenCalledOnce()
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
  })

  it('uses a generic local-library context when no document is active', () => {
    render(<ImmersiveTitlebarChrome {...createProps()} activePath={null} />)

    expect(screen.getByText('Marklab')).toBeInTheDocument()
    expect(screen.getByText('本地知识库')).toBeInTheDocument()
    expect(screen.getByText('未命名文档')).toBeInTheDocument()
  })
})
