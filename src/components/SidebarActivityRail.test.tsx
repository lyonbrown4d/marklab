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
        fileCount={135}
        recentProjectCount={0}
        onSelectActivity={vi.fn()}
        onUseInternalRoot={vi.fn()}
      />,
    )

    const searchButton = screen.getByRole('button', { name: 'Search' })
    const filesButton = screen.getByRole('button', { name: 'Files' })

    expect(searchButton).toHaveAttribute('aria-current', 'page')
    expect(searchButton).toHaveAttribute('type', 'button')
    expect(filesButton).not.toHaveAttribute('aria-current')
    expect(screen.getByText('99')).toBeInTheDocument()
  })

  it('keeps activity and local workspace actions clickable', () => {
    const onSelectActivity = vi.fn()
    const onUseInternalRoot = vi.fn()

    render(
      <SidebarActivityRail
        activeActivity="explorer"
        fileCount={1}
        recentProjectCount={2}
        onSelectActivity={onSelectActivity}
        onUseInternalRoot={onUseInternalRoot}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Recent Projects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Local Workspace' }))

    expect(onSelectActivity).toHaveBeenCalledWith('projects')
    expect(onUseInternalRoot).toHaveBeenCalledTimes(1)
  })
})
