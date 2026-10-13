import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'

describe('WorkspaceMapState', () => {
  it('shows the document loading status once and preserves its action', () => {
    const onAction = vi.fn()
    render(
      <WorkspaceMapState loading label="Loading map" actionLabel="Retry" onAction={onAction} />,
    )

    const status = screen.getByRole('status', { name: 'Loading map' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelector('[data-document-loading]')).toHaveAttribute('aria-hidden', 'true')
    expect(status.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('clears busy state and preserves the failure label and retry action', () => {
    const onAction = vi.fn()
    const view = render(<WorkspaceMapState loading label="Loading map" />)
    view.rerender(
      <WorkspaceMapState label="Map unavailable" actionLabel="Retry" onAction={onAction} />,
    )

    expect(screen.getByText('Map unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(view.container.querySelector('[aria-busy="true"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
