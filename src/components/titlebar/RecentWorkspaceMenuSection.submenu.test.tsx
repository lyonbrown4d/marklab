import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMenu } from '@/components/titlebar/RecentWorkspaceMenuSection.testSupport'
import { recentWorkspaceApi } from '@/services/recentWorkspaceApi'

vi.mock('@/services/recentWorkspaceApi', () => ({
  recentWorkspaceApi: {
    isAvailable: vi.fn(() => true),
    list: vi.fn(),
    remove: vi.fn(),
    watch: vi.fn(async () => () => undefined),
  },
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('recent workspace submenu', () => {
  beforeEach(() => {
    vi.mocked(recentWorkspaceApi.list)
      .mockReset()
      .mockResolvedValue(
        Array.from({ length: 40 }, (_, index) => ({
          path: `/workspace-${index}`,
          status: 'available',
        })),
      )
    vi.mocked(recentWorkspaceApi.watch).mockReset().mockResolvedValue(vi.fn())
  })

  it('loads and watches only while the submenu is active, including pointer opening', async () => {
    const { user } = await renderMenu('external', false)
    const recent = screen.getByRole('menuitem', { name: 'Recent' })
    expect(recent).toHaveAttribute('aria-haspopup', 'menu')
    expect(recentWorkspaceApi.list).not.toHaveBeenCalled()
    expect(recentWorkspaceApi.watch).not.toHaveBeenCalled()
    await user.hover(recent)
    expect(await screen.findByRole('menuitem', { name: 'Open workspace-39' })).toBeVisible()
    const stop = await vi.mocked(recentWorkspaceApi.watch).mock.results[0].value
    screen.getByRole('menu', { name: 'Recent' }).focus()
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(recent).toHaveFocus()
    expect(screen.queryByRole('menu', { name: 'Recent' })).not.toBeInTheDocument()
    expect(screen.getByRole('menu')).toBeVisible()
  })

  it('constrains a long list and keeps the last entry reachable with keyboard navigation', async () => {
    const { user, onOpenProject } = await renderMenu('external', false)
    screen.getByRole('menuitem', { name: 'Recent' }).focus()
    await user.keyboard('{ArrowRight}')
    const submenu = await screen.findByRole('menu', { name: 'Recent' })
    expect(submenu).toHaveClass('overflow-y-auto', 'overscroll-contain')
    expect(submenu).toHaveClass(
      'max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))]',
    )
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open workspace-0' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(submenu).toHaveFocus()
    await user.keyboard('{End}')
    await waitFor(() =>
      expect(
        screen.getAllByRole('menuitem', { name: 'workspace.removeHistory' }).at(-1),
      ).toHaveFocus(),
    )
    await user.keyboard('{ArrowUp}')
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Open workspace-39' })).toHaveFocus(),
    )
    await user.keyboard('{Enter}')
    expect(onOpenProject).toHaveBeenCalledExactlyOnceWith('/workspace-39')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
