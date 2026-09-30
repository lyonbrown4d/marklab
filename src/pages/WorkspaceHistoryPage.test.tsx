import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceHistoryPage from '@/pages/WorkspaceHistoryPage'
import { appApi } from '@/services/appApi'

const onOpenProject = vi.fn()
const onOpenProjectInCurrentWindow = vi.fn()
const onUseInternalRoot = vi.fn()
const layoutContext = {
  rootKind: 'external' as 'external' | 'internal',
  rootPath: 'D:/notes/current',
  recentProjects: ['D:/notes/current', 'D:/writing/book', 'E:/archive'],
  onOpenProject,
  onOpenProjectInCurrentWindow,
  onUseInternalRoot,
}

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: never) => unknown) => selector(layoutContext as never),
}))

vi.mock('@/services/appApi', () => ({
  appApi: { menuDispatch: vi.fn() },
}))

describe('WorkspaceHistoryPage', () => {
  beforeEach(() => {
    layoutContext.rootKind = 'external'
    layoutContext.rootPath = 'D:/notes/current'
    layoutContext.recentProjects = ['D:/notes/current', 'D:/writing/book', 'E:/archive']
  })

  it('opens MRU entries in a new window without switching the current workspace', () => {
    render(<WorkspaceHistoryPage />)

    expect(screen.getByRole('heading', { name: 'Workspace history' })).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('D:/notes/current')).toBeInTheDocument()

    const recentButtons = screen.getAllByRole('button', { name: /Open in new window:/ })
    expect(recentButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('current'),
      expect.stringContaining('book'),
      expect.stringContaining('archive'),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Open in new window: book' }))
    expect(onOpenProject).toHaveBeenCalledWith('D:/writing/book')
    expect(onOpenProjectInCurrentWindow).not.toHaveBeenCalled()
  })

  it('offers a secondary current-window action only for non-current workspaces', () => {
    render(<WorkspaceHistoryPage />)

    expect(
      screen.queryByRole('button', { name: 'Open in current window: current' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open in current window: book' }))

    expect(onOpenProjectInCurrentWindow).toHaveBeenCalledWith('D:/writing/book')
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('offers the local library and marks it when it is current', () => {
    layoutContext.rootKind = 'internal'
    layoutContext.rootPath = ''

    render(<WorkspaceHistoryPage />)

    const localLibrary = screen.getByRole('button', { name: 'Open local library' })
    expect(localLibrary).toHaveAttribute('aria-current', 'page')
    fireEvent.click(localLibrary)
    expect(onUseInternalRoot).toHaveBeenCalledOnce()
  })

  it('shows a useful empty state and can open the workspace picker', () => {
    layoutContext.recentProjects = []

    render(<WorkspaceHistoryPage />)

    expect(screen.getByText('No recently opened workspaces')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open workspace' })[0])
    expect(appApi.menuDispatch).toHaveBeenCalledWith('file.open_project')
  })
})
