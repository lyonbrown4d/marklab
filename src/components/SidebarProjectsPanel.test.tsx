import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SidebarProjectsPanel from '@/components/SidebarProjectsPanel'

const messages: Record<string, string> = {
  'actions.openProject': 'Open project',
  'workspace.openRecentInNewWindow': 'Open in new window: {{name}}',
  'sidebar.localWorkspace': 'Local workspace',
  'sidebar.noRecentProjects': 'No recent projects',
  'sidebar.recentProjects': 'Recent projects',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      Object.entries(values ?? {}).reduce(
        (label, [name, value]) => label.replaceAll(`{{${name}}}`, value),
        messages[key] ?? key,
      ),
  }),
}))

describe('SidebarProjectsPanel', () => {
  it('uses the shared flat sidebar panel structure', () => {
    render(
      <SidebarProjectsPanel
        onOpenProject={vi.fn()}
        onSelectProject={vi.fn()}
        onUseInternalRoot={vi.fn()}
        recentProjects={[]}
      />,
    )

    const panel = screen.getByRole('region', { name: 'Recent projects' })
    expect(panel).toHaveAttribute('data-sidebar-panel', 'projects')
    expect(panel).toHaveClass('p-0')
    expect(screen.getByRole('heading', { name: 'Recent projects' })).toHaveClass(
      'h-8',
      'px-1',
      'text-xs',
      'font-medium',
    )
    expect(screen.getByRole('button', { name: 'Open project' })).toHaveClass(
      'focus-visible:ring-sidebar-ring',
      'active:bg-sidebar-accent',
    )
  })

  it('opens the internal workspace and recent projects from accessible buttons', () => {
    const onOpenProject = vi.fn()
    const onSelectProject = vi.fn()
    const onUseInternalRoot = vi.fn()

    render(
      <SidebarProjectsPanel
        onOpenProject={onOpenProject}
        onSelectProject={onSelectProject}
        onUseInternalRoot={onUseInternalRoot}
        recentProjects={['D:/notes', 'D:/archive']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Local workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open in new window: D:/notes' }))

    expect(onSelectProject).toHaveBeenCalledTimes(1)
    expect(onUseInternalRoot).toHaveBeenCalledTimes(1)
    expect(onOpenProject).toHaveBeenCalledWith('D:/notes')
    expect(screen.getByRole('heading', { name: /Recent projects/ })).toBeInTheDocument()
  })

  it('shows an empty recent projects message', () => {
    render(
      <SidebarProjectsPanel
        onOpenProject={vi.fn()}
        onSelectProject={vi.fn()}
        onUseInternalRoot={vi.fn()}
        recentProjects={[]}
      />,
    )

    const empty = screen.getByRole('note')
    expect(empty).toHaveTextContent('No recent projects')
    expect(empty.querySelector('[data-slot="empty-icon"]')).toBeInTheDocument()
  })
})
