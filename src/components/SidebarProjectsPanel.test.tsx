import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import SidebarProjectsPanel from '@/components/SidebarProjectsPanel'

const messages: Record<string, string> = {
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
    const onUseInternalRoot = vi.fn()

    render(
      <SidebarProjectsPanel
        onOpenProject={onOpenProject}
        onUseInternalRoot={onUseInternalRoot}
        recentProjects={['D:/notes', 'D:/archive']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Local workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'D:/notes' }))

    expect(onUseInternalRoot).toHaveBeenCalledTimes(1)
    expect(onOpenProject).toHaveBeenCalledWith('D:/notes')
    expect(screen.getByRole('heading', { name: /Recent projects/ })).toBeInTheDocument()
  })

  it('shows an empty recent projects message', () => {
    render(
      <SidebarProjectsPanel
        onOpenProject={vi.fn()}
        onUseInternalRoot={vi.fn()}
        recentProjects={[]}
      />,
    )

    expect(screen.getByText('No recent projects')).toBeInTheDocument()
  })
})
