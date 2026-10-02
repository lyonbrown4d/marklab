import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceViewSwitcher } from '@/components/WorkspaceViewSwitcher'

describe('WorkspaceViewSwitcher', () => {
  it('shows the active workspace view and dispatches Files and Map actions', async () => {
    const onOpenFiles = vi.fn()
    const onOpenMap = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <WorkspaceViewSwitcher
        activeView="files"
        filesLabel="Files"
        groupLabel="Workspace view"
        mapLabel="Map"
        onOpenFiles={onOpenFiles}
        onOpenMap={onOpenMap}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Workspace view' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Files' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Map' })).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('radio', { name: 'Map' }))
    expect(onOpenMap).toHaveBeenCalledOnce()

    rerender(
      <WorkspaceViewSwitcher
        activeView="map"
        filesLabel="Files"
        groupLabel="Workspace view"
        mapLabel="Map"
        onOpenFiles={onOpenFiles}
        onOpenMap={onOpenMap}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Map' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Files' }))
    expect(onOpenFiles).toHaveBeenCalledOnce()
  })

  it('keeps the current workspace view selected and keyboard reachable', async () => {
    const onOpenFiles = vi.fn()
    const onOpenMap = vi.fn()
    const user = userEvent.setup()
    render(
      <WorkspaceViewSwitcher
        activeView="files"
        filesLabel="Files"
        groupLabel="Workspace view"
        mapLabel="Map"
        onOpenFiles={onOpenFiles}
        onOpenMap={onOpenMap}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Workspace view' })
    const files = screen.getByRole('radio', { name: 'Files' })
    await user.tab()
    expect(group).toBeInTheDocument()
    expect(files).toHaveFocus()

    await user.click(files)
    expect(onOpenFiles).not.toHaveBeenCalled()
    expect(onOpenMap).not.toHaveBeenCalled()
  })
})
