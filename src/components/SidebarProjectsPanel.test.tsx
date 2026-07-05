import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import SidebarProjectsPanel from '@/components/SidebarProjectsPanel'

const messages: Record<string, string> = {
  'actions.openProject': 'Open project',
  'sidebar.localWorkspace': 'Local workspace',
  'sidebar.noRecentProjects': 'No recent projects',
  'sidebar.recentProjects': 'Recent projects',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
}))

describe('SidebarProjectsPanel', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'D:/notes' }))

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
