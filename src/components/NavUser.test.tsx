import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NavUser } from '@/components/nav-user'

vi.mock('@/components/ui/sidebar', () => ({
  SidebarMenu: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    className,
  }: {
    children: ReactNode
    className?: string
    size?: string
  }) => <button className={className}>{children}</button>,
  useSidebar: () => ({ isMobile: false }),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
}))

describe('NavUser', () => {
  it('uses compact shadcn avatar sizing in the trigger and menu label', () => {
    render(
      <NavUser
        user={{
          avatar: '/ada.png',
          email: 'ada@example.com',
          name: 'Ada Lovelace',
        }}
      />,
    )

    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2)
    expect(screen.getAllByText('ada@example.com')).toHaveLength(2)
    expect(document.querySelectorAll('.size-8.rounded-lg')).toHaveLength(2)
    expect(document.querySelectorAll('.h-8.w-8')).toHaveLength(0)
  })
})
