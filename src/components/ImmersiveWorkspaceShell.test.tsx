import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImmersiveWorkspaceShell } from '@/components/ImmersiveWorkspaceShell'

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
        onToggleInspector={vi.fn()}
      >
        <article>Editor canvas</article>
      </ImmersiveWorkspaceShell>,
    )

    expect(screen.getByRole('dialog', { name: 'Document outline' })).toBeInTheDocument()
    expect(screen.getAllByText('Document outline')).toHaveLength(2)
  })
})
