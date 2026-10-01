import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SidebarWorkspaceGraphPanel from '@/components/SidebarWorkspaceGraphPanel'

const messages: Record<string, string> = {
  'sidebar.files': 'Files',
  'sidebar.recentProjects': 'Recent projects',
  'tabs.workspaceGraph': 'Workspace graph',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

describe('SidebarWorkspaceGraphPanel', () => {
  it('uses the shared flat sidebar panel structure without nested statistic cards', () => {
    render(
      <SidebarWorkspaceGraphPanel
        fileCount={3}
        onOpenWorkspaceGraph={vi.fn()}
        recentProjects={['D:/notes']}
        rootPath="D:/notes"
      />,
    )

    const panel = screen.getByRole('region', { name: 'Workspace graph' })
    expect(panel).toHaveAttribute('data-sidebar-panel', 'graph')
    expect(panel).toHaveClass('p-0')
    expect(panel).not.toHaveClass('border', 'rounded-lg')
    expect(screen.getByRole('heading', { name: 'Workspace graph' })).toHaveClass(
      'h-8',
      'px-1',
      'text-xs',
      'font-medium',
    )
    expect(screen.getByText('Files').parentElement).not.toHaveClass('border', 'rounded-md')
    expect(screen.getByText('Recent projects').parentElement).not.toHaveClass(
      'border',
      'rounded-md',
    )
    expect(screen.getByRole('button', { name: 'Workspace graph' })).toHaveClass(
      'focus-visible:ring-sidebar-ring',
      'active:bg-sidebar-accent',
    )
  })
})
