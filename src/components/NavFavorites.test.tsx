import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { NavFavorites } from '@/components/nav-favorites'

const messages: Record<string, string> = {
  'nav.favoriteCopyLink': 'Copy Link',
  'nav.favoriteDelete': 'Delete',
  'nav.favoriteMore': 'More',
  'nav.favoriteOpenInNewTab': 'Open in New Tab',
  'nav.favoriteRemove': 'Remove from Favorites',
  'nav.favorites': 'Favorites',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuAction: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SidebarMenuButton: ({ asChild, children }: { asChild?: boolean; children: ReactNode }) =>
    asChild ? <>{children}</> : <button type="button">{children}</button>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  useSidebar: () => ({ isMobile: false }),
}))

describe('NavFavorites', () => {
  it('uses localized labels for favorite navigation actions', () => {
    render(<NavFavorites favorites={[{ emoji: 'M', name: 'Manual', url: '/manual' }]} />)

    expect(screen.getByRole('heading', { name: 'Favorites' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'More' })).toHaveLength(2)
    expect(screen.getByText('Remove from Favorites')).toBeInTheDocument()
    expect(screen.getByText('Copy Link')).toBeInTheDocument()
    expect(screen.getByText('Open in New Tab')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })
})
