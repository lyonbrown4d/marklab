import { describe, expect, it, vi } from 'vitest'
import { toggleSidebarFromShortcut } from '@/app/sidebarShortcut'

describe('toggleSidebarFromShortcut', () => {
  it('focuses the sidebar after a successful keyboard open', () => {
    let collapsed = true
    const requestFocus = vi.fn()
    const scheduleFocus = vi.fn((callback: () => void) => callback())

    toggleSidebarFromShortcut({
      isCollapsed: () => collapsed,
      toggleSidebar: () => {
        collapsed = !collapsed
      },
      requestFocus,
      scheduleFocus,
    })

    expect(collapsed).toBe(false)
    expect(scheduleFocus).toHaveBeenCalledOnce()
    expect(requestFocus).toHaveBeenCalledOnce()
  })

  it('does not steal focus while closing or when an open request is rejected', () => {
    const requestFocus = vi.fn()
    const scheduleFocus = vi.fn()
    let collapsed = false

    toggleSidebarFromShortcut({
      isCollapsed: () => collapsed,
      toggleSidebar: () => {
        collapsed = true
      },
      requestFocus,
      scheduleFocus,
    })
    toggleSidebarFromShortcut({
      isCollapsed: () => true,
      toggleSidebar: vi.fn(),
      requestFocus,
      scheduleFocus,
    })

    expect(scheduleFocus).not.toHaveBeenCalled()
    expect(requestFocus).not.toHaveBeenCalled()
  })
})
