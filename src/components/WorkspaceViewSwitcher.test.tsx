import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceViewSwitcher } from '@/components/WorkspaceViewSwitcher'
import { preloadGraphView } from '@/lib/preloadFeatures'

vi.mock('@/lib/preloadFeatures', () => ({
  preloadGraphView: vi.fn(),
}))

describe('WorkspaceViewSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('preloads the map feature when its control is hovered or focused', () => {
    render(
      <WorkspaceViewSwitcher
        activeView="files"
        filesLabel="Files"
        groupLabel="Workspace view"
        mapLabel="Map"
        onOpenFiles={vi.fn()}
        onOpenMap={vi.fn()}
      />,
    )

    const map = screen.getByRole('radio', { name: 'Map' })
    fireEvent.pointerEnter(map)
    fireEvent.focus(map)

    expect(preloadGraphView).toHaveBeenCalledTimes(2)
  })
})
