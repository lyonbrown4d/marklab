import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SidebarActivityRail from '@/components/SidebarActivityRail'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'scm.title': 'Source Control',
        'sidebar.files': 'Files',
        'sidebar.localWorkspace': 'Local Workspace',
        'sidebar.recentProjects': 'Recent Projects',
        'sidebar.searchAction': 'Search',
        'sidebar.workspaceOverview': 'Workspace Overview',
        'tabs.workspaceGraph': 'Workspace Graph',
      }

      return labels[key] ?? key
    },
  }),
}))

describe('SidebarActivityRail', () => {
  it('marks the active activity for assistive technology', () => {
    render(
      <SidebarActivityRail
        activeActivity="search"
        homeActive={false}
        fileCount={135}
        recentProjectCount={0}
        onOpenWorkspaceOverview={vi.fn()}
        onSelectActivity={vi.fn()}
      />,
    )

    const searchButton = screen.getByRole('button', { name: 'Search' })
    const filesButton = screen.getByRole('button', { name: 'Files' })

    expect(searchButton).toHaveAttribute('aria-current', 'page')
    expect(searchButton).toHaveAttribute('type', 'button')
    expect(filesButton).not.toHaveAttribute('aria-current')
    expect(screen.getByText('99')).toBeInTheDocument()
  })

  it('keeps activity and workspace overview actions clickable', () => {
    const onSelectActivity = vi.fn()
    const onOpenWorkspaceOverview = vi.fn()

    render(
      <SidebarActivityRail
        activeActivity="explorer"
        homeActive
        fileCount={1}
        recentProjectCount={2}
        onOpenWorkspaceOverview={onOpenWorkspaceOverview}
        onSelectActivity={onSelectActivity}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Recent Projects' }))
    const overviewButton = screen.getByRole('button', { name: 'Workspace Overview' })
    fireEvent.click(overviewButton)

    expect(overviewButton).toHaveAttribute('aria-current', 'page')
    expect(onSelectActivity).toHaveBeenCalledWith('projects')
    expect(onOpenWorkspaceOverview).toHaveBeenCalledTimes(1)
  })

  it('uses one workspace menu when expanded while preserving every destination', async () => {
    const onSelectActivity = vi.fn()
    render(
      <SidebarActivityRail
        collapsed={false}
        rootPath="D:\\Notes\\Marklab\\"
        activeActivity="explorer"
        homeActive={false}
        fileCount={1}
        recentProjectCount={2}
        onOpenWorkspaceOverview={vi.fn()}
        onSelectActivity={onSelectActivity}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Marklab' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const search = await screen.findByRole('menuitem', { name: 'Search' })
    expect(screen.getAllByRole('menuitem')).toHaveLength(6)
    expect(screen.getByRole('menuitem', { name: /Files/ })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(search)
    expect(onSelectActivity).toHaveBeenCalledWith('search')
  })

  it('supports POSIX workspace paths without exposing the full path in the header', () => {
    render(
      <SidebarActivityRail
        collapsed={false}
        rootPath="/home/writer/Notes/"
        activeActivity="explorer"
        homeActive={false}
        fileCount={0}
        recentProjectCount={0}
        onOpenWorkspaceOverview={vi.fn()}
        onSelectActivity={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Notes' })).toBeVisible()
  })
})
