import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImmersiveWorkspaceShell } from '@/components/ImmersiveWorkspaceShell'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const FocusReturnHarness = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setSidebarOpen(true)}>
        Open workspace drawer
      </button>
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
    </>
  )
}

describe('ImmersiveWorkspaceShell', () => {
  it('keeps the canvas chrome-free and exposes navigation from the edge', async () => {
    const onToggleSidebar = vi.fn()
    render(
      <ImmersiveWorkspaceShell
        sidebarOpen={false}
        inspectorOpen={false}
        sidebar={<div>Workspace files</div>}
        inspector={<div>Document outline</div>}
        sidebarLabel="Open workspace"
        inspectorLabel="Document outline"
        onToggleSidebar={onToggleSidebar}
        onSidebarOpenChange={vi.fn()}
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    expect(screen.getByText('Editor canvas')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByText('Workspace files')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open workspace' }))
    expect(onToggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders navigation and outline as overlay dialogs', () => {
    const { rerender } = render(
      <ImmersiveWorkspaceShell
        sidebarOpen
        inspectorOpen={false}
        sidebar={<div>Workspace files</div>}
        inspector={<div>Document outline</div>}
        sidebarLabel="Open workspace"
        inspectorLabel="Document outline"
        onToggleSidebar={vi.fn()}
        onSidebarOpenChange={vi.fn()}
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    expect(screen.getByRole('dialog', { name: 'Open workspace' })).toBeInTheDocument()
    expect(screen.getByText('Workspace files')).toBeInTheDocument()

    rerender(
      <ImmersiveWorkspaceShell
        sidebarOpen={false}
        inspectorOpen
        sidebar={<div>Workspace files</div>}
        inspector={<div>Document outline</div>}
        sidebarLabel="Open workspace"
        inspectorLabel="Document outline"
        onToggleSidebar={vi.fn()}
        onSidebarOpenChange={vi.fn()}
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    expect(screen.getByRole('dialog', { name: 'Document outline' })).toBeInTheDocument()
    expect(screen.getAllByText('Document outline')).toHaveLength(2)
  })

  it('sends an idempotent close request from the drawer close button', async () => {
    const onSidebarOpenChange = vi.fn()
    render(
      <ImmersiveWorkspaceShell
        sidebarOpen
        inspectorOpen={false}
        sidebar={<button type="button">Search files</button>}
        inspector={<div>Document outline</div>}
        sidebarLabel="Workspace"
        inspectorLabel="Document outline"
        onToggleSidebar={vi.fn()}
        onSidebarOpenChange={onSidebarOpenChange}
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onSidebarOpenChange).toHaveBeenCalledOnce()
    expect(onSidebarOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps hover open and close transient instead of requesting persisted state changes', () => {
    vi.useFakeTimers()
    usePreferencesStore.setState({ sidebarCollapsed: true })
    const onSidebarOpenChange = vi.fn((open: boolean) => {
      usePreferencesStore.setState({ sidebarCollapsed: !open })
    })
    const props = {
      sidebarOpen: false,
      inspectorOpen: false,
      sidebar: <button type="button">Search files</button>,
      inspector: <div>Document outline</div>,
      sidebarLabel: 'Workspace',
      inspectorLabel: 'Document outline',
      onToggleSidebar: vi.fn(),
      onSidebarOpenChange,
      onToggleInspector: vi.fn(),
    }
    render(
      <ImmersiveWorkspaceShell {...props}>
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    fireEvent.pointerEnter(screen.getByTestId('sidebar-hover-zone'))
    act(() => vi.advanceTimersByTime(179))
    expect(onSidebarOpenChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('dialog', { name: 'Workspace' })).toBeInTheDocument()
    expect(onSidebarOpenChange).not.toHaveBeenCalled()
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true)

    fireEvent.pointerEnter(screen.getByRole('dialog', { name: 'Workspace' }))
    fireEvent.pointerLeave(screen.getByRole('dialog', { name: 'Workspace' }))
    act(() => vi.advanceTimersByTime(219))
    expect(screen.getByRole('dialog', { name: 'Workspace' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('dialog', { name: 'Workspace' })).not.toBeInTheDocument()
    expect(onSidebarOpenChange).not.toHaveBeenCalled()
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true)
    vi.useRealTimers()
  })

  it('makes a retained closing drawer inert while its exit animation completes', () => {
    const nativeGetComputedStyle = window.getComputedStyle
    const getComputedStyleSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element) => {
        const styles = nativeGetComputedStyle(element)
        if (!(element instanceof HTMLElement) || !element.classList.contains('immersive-drawer')) {
          return styles
        }
        return new Proxy(styles, {
          get: (target, property) =>
            property === 'animationName'
              ? element.dataset.state === 'closed'
                ? 'drawer-out'
                : 'drawer-in'
              : Reflect.get(target, property, target),
        })
      })
    const props = {
      sidebarOpen: true,
      inspectorOpen: false,
      sidebar: <button type="button">Search files</button>,
      inspector: <div>Document outline</div>,
      sidebarLabel: 'Workspace',
      inspectorLabel: 'Document outline',
      onToggleSidebar: vi.fn(),
      onSidebarOpenChange: vi.fn(),
      onToggleInspector: vi.fn(),
    }
    const { rerender } = render(
      <ImmersiveWorkspaceShell {...props}>
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    rerender(
      <ImmersiveWorkspaceShell {...props} sidebarOpen={false}>
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    const closingDrawer = document.querySelector<HTMLElement>(
      '[role="dialog"][data-state="closed"]',
    )
    expect(closingDrawer).toHaveAttribute('aria-hidden', 'true')
    expect(closingDrawer).toHaveAttribute('inert')
    expect(closingDrawer).toHaveClass('data-[state=closed]:pointer-events-none')
    getComputedStyleSpy.mockRestore()
  })

  it('does not auto-close a sidebar that was explicitly opened or pinned by interaction', () => {
    vi.useFakeTimers()
    const onSidebarOpenChange = vi.fn()
    const { rerender } = render(
      <ImmersiveWorkspaceShell
        sidebarOpen
        inspectorOpen={false}
        sidebar={<button type="button">Search files</button>}
        inspector={<div>Document outline</div>}
        sidebarLabel="Workspace"
        inspectorLabel="Document outline"
        onToggleSidebar={vi.fn()}
        onSidebarOpenChange={onSidebarOpenChange}
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    fireEvent.pointerLeave(screen.getByRole('dialog', { name: 'Workspace' }))
    act(() => vi.advanceTimersByTime(220))
    expect(onSidebarOpenChange).not.toHaveBeenCalled()

    rerender(
      <ImmersiveWorkspaceShell
        sidebarOpen={false}
        inspectorOpen={false}
        sidebar={<button type="button">Search files</button>}
        inspector={<div>Document outline</div>}
        sidebarLabel="Workspace"
        inspectorLabel="Document outline"
        onToggleSidebar={vi.fn()}
        onSidebarOpenChange={onSidebarOpenChange}
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )
    fireEvent.pointerEnter(screen.getByTestId('sidebar-hover-zone'))
    act(() => vi.advanceTimersByTime(180))
    rerender(
      <ImmersiveWorkspaceShell
        sidebarOpen
        inspectorOpen={false}
        sidebar={<button type="button">Search files</button>}
        inspector={<div>Document outline</div>}
        sidebarLabel="Workspace"
        inspectorLabel="Document outline"
        onToggleSidebar={vi.fn()}
        onSidebarOpenChange={onSidebarOpenChange}
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Search files' }))
    fireEvent.pointerLeave(screen.getByRole('dialog', { name: 'Workspace' }))
    act(() => vi.advanceTimersByTime(220))
    expect(onSidebarOpenChange.mock.calls.filter(([open]) => open === false)).toHaveLength(0)
    vi.useRealTimers()
  })

  it('closes on Escape and returns focus to the opener', async () => {
    render(<FocusReturnHarness />)
    const opener = screen.getByRole('button', { name: 'Open workspace drawer' })

    await userEvent.click(opener)
    await userEvent.click(screen.getByRole('button', { name: 'Search files' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Workspace' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
