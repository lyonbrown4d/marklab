import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImmersiveWorkspaceShell } from '@/components/ImmersiveWorkspaceShell'
import { SIDEBAR_HOVER_OPEN_DELAY_MS } from '@/components/useSidebarHoverPreview'
import { useNativeSurfaceInsetsStore } from '@/app/nativeSurfaceInsets'

const LayoutHarness = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <ImmersiveWorkspaceShell
      sidebarOpen={sidebarOpen}
      inspectorOpen={false}
      sidebar={<button type="button">Search files</button>}
      inspector={<div>Document outline</div>}
      sidebarLabel="Workspace"
      inspectorLabel="Document outline"
      onToggleSidebar={() => setSidebarOpen((open) => !open)}
      onSidebarOpenChange={setSidebarOpen}
      onToggleInspector={vi.fn()}
    >
      <article>Editor canvas</article>
    </ImmersiveWorkspaceShell>
  )
}

describe('ImmersiveWorkspaceShell layout', () => {
  afterEach(() => vi.useRealTimers())

  it('reserves desktop width only while click-pinned and releases it on dismissal', () => {
    render(<LayoutHarness />)
    const editor = screen.getByRole('main')

    // The lg prefix keeps compact windows overlay-based even when pinned.
    expect(editor).toHaveClass('lg:data-[sidebar-pinned=true]:ml-[22rem]')
    expect(editor).toHaveAttribute('data-sidebar-pinned', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }))
    expect(editor).toHaveAttribute('data-sidebar-pinned', 'true')
    expect(screen.getByRole('dialog', { name: 'Workspace' })).toBeVisible()
    expect(useNativeSurfaceInsetsStore.getState().leftDrawerOpen).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(editor).toHaveAttribute('data-sidebar-pinned', 'false')
    expect(useNativeSurfaceInsetsStore.getState().leftDrawerOpen).toBe(false)
  })

  it('keeps hover preview overlaid until interaction pins the drawer', () => {
    vi.useFakeTimers()
    const { unmount } = render(<LayoutHarness />)
    const editor = screen.getByRole('main')

    fireEvent.pointerEnter(screen.getByTestId('sidebar-hover-zone'))
    act(() => vi.advanceTimersByTime(SIDEBAR_HOVER_OPEN_DELAY_MS))
    expect(screen.getByRole('dialog', { name: 'Workspace' })).toBeVisible()
    expect(editor).toHaveAttribute('data-sidebar-pinned', 'false')
    expect(useNativeSurfaceInsetsStore.getState().leftDrawerOpen).toBe(true)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Search files' }))
    expect(editor).toHaveAttribute('data-sidebar-pinned', 'true')
    expect(useNativeSurfaceInsetsStore.getState().leftDrawerOpen).toBe(true)

    unmount()
    expect(useNativeSurfaceInsetsStore.getState().leftDrawerOpen).toBe(false)
  })
})
