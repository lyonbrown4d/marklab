import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ImmersiveWorkspaceShell } from '@/components/ImmersiveWorkspaceShell'

const FileOpenFocusHarness = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newSurfaceOpen, setNewSurfaceOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setSidebarOpen(true)}>
        Previous editor
      </button>
      {newSurfaceOpen ? (
        <button autoFocus type="button">
          New surface
        </button>
      ) : null}
      <ImmersiveWorkspaceShell
        sidebarOpen={sidebarOpen}
        inspectorOpen={false}
        sidebar={
          <button
            type="button"
            onClick={() => {
              setNewSurfaceOpen(true)
              setSidebarOpen(false)
            }}
          >
            Open note
          </button>
        }
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

it('dismisses a transient hover preview when a file-tree open requests closing', () => {
  vi.useFakeTimers()
  const props = {
    sidebarOpen: false,
    inspectorOpen: false,
    sidebar: <button type="button">Search files</button>,
    inspector: <div>Document outline</div>,
    sidebarLabel: 'Workspace',
    inspectorLabel: 'Document outline',
    onToggleSidebar: vi.fn(),
    onSidebarOpenChange: vi.fn(),
    onToggleInspector: vi.fn(),
  }

  try {
    const { rerender } = render(
      <ImmersiveWorkspaceShell {...props} sidebarDismissRequest={0}>
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )
    fireEvent.pointerEnter(screen.getByTestId('sidebar-hover-zone'))
    act(() => vi.advanceTimersByTime(180))
    expect(screen.getByRole('dialog', { name: 'Workspace' })).toBeInTheDocument()

    rerender(
      <ImmersiveWorkspaceShell {...props} sidebarDismissRequest={1}>
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    expect(screen.queryByRole('dialog', { name: 'Workspace' })).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

it('preserves focus that moved to the newly opened surface before dismissal', async () => {
  const user = userEvent.setup()
  render(<FileOpenFocusHarness />)

  await user.click(screen.getByRole('button', { name: 'Previous editor' }))
  await user.click(screen.getByRole('button', { name: 'Open note' }))

  expect(screen.getByRole('button', { name: 'New surface' })).toHaveFocus()
})
