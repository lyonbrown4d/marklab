import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { NavWorkspaces } from '@/components/nav-workspaces'

const messages: Record<string, string> = {
  'nav.workspaceAddPage': 'Add page to {{name}}',
  'nav.workspaceMore': 'More',
  'nav.workspaceToggle': 'Toggle {{name}} workspace',
  'nav.workspaces': 'Workspaces',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const message = messages[key] ?? key
      return Object.entries(values ?? {}).reduce(
        (current, [name, value]) => current.replace(`{{${name}}}`, value),
        message,
      )
    },
  }),
}))

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuAction: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SidebarMenuButton: ({ asChild, children }: { asChild?: boolean; children: ReactNode }) =>
    asChild ? <>{children}</> : <button type="button">{children}</button>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  SidebarMenuSub: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuSubButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarMenuSubItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
}))

describe('NavWorkspaces', () => {
  it('uses localized labels for workspace navigation controls', () => {
    render(
      <NavWorkspaces
        workspaces={[
          {
            emoji: 'D',
            name: 'Docs',
            pages: [{ emoji: 'P', name: 'Plan' }],
          },
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle Docs workspace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add page to Docs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })
})
