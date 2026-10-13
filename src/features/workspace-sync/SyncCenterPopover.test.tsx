import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SyncCenterPopover } from '@/features/workspace-sync/SyncCenterPopover'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('SyncCenterPopover', () => {
  it('opens configuration directly for an unbound workspace', async () => {
    const onConfigure = vi.fn()
    render(
      <SyncCenterPopover
        webdav={{ status: 'unbound' }}
        onConfigure={onConfigure}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.configure' }))
    await waitFor(() => expect(onConfigure).toHaveBeenCalledOnce())
    expect(screen.queryByText('sync.center.title')).not.toBeInTheDocument()
  })

  it('opens conflict review from the persisted count', async () => {
    const onReviewConflicts = vi.fn()
    render(
      <SyncCenterPopover
        onConfigure={vi.fn()}
        webdav={{ status: 'idle', label: 'Cloud', conflictCount: 2 }}
        onReviewConflicts={onReviewConflicts}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.conflicts' }))
    await waitFor(() => expect(onReviewConflicts).toHaveBeenCalledOnce())
  })

  it('keeps sync controls visible while reporting a cancellation error', async () => {
    render(
      <SyncCenterPopover
        onConfigure={vi.fn()}
        webdav={{ status: 'syncing', label: 'Cloud', progress: 40, stage: 'applying' }}
        cancelError="cancel failed"
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    expect(screen.getByRole('alert')).toHaveTextContent('cancel failed')
    expect(screen.getByRole('button', { name: 'sync.center.cancel' })).toBeEnabled()
  })
  it('opens a compact WebDAV summary and starts sync', async () => {
    const onStart = vi.fn()
    render(
      <SyncCenterPopover
        onConfigure={vi.fn()}
        webdav={{ status: 'idle', label: 'Home cloud' }}
        onCancel={vi.fn()}
        onStart={onStart}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    expect(screen.getByText('Home cloud')).toBeInTheDocument()
    expect(screen.queryByText('sync.channel.git')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.syncNow' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('shows progress and cancellation while WebDAV is running', async () => {
    const onCancel = vi.fn()
    render(
      <SyncCenterPopover
        onConfigure={vi.fn()}
        webdav={{ status: 'syncing', label: 'Home cloud', progress: 45, stage: 'planning' }}
        onCancel={onCancel}
        onStart={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45')
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
  it('disables cancellation while a cancellation request is pending', async () => {
    render(
      <SyncCenterPopover
        onConfigure={vi.fn()}
        webdav={{ status: 'syncing', label: 'Home cloud', progress: 45, stage: 'planning' }}
        cancelPending
        onCancel={vi.fn()}
        onStart={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    expect(screen.getByRole('button', { name: 'sync.center.cancel' })).toBeDisabled()
  })
  it('allows reviewing persisted conflicts when the live sync count is empty', async () => {
    const onReviewConflicts = vi.fn()
    render(
      <SyncCenterPopover
        webdav={{ status: 'idle', label: 'Cloud', conflictCount: 0 }}
        onReviewConflicts={onReviewConflicts}
        onConfigure={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'sync.center.open' }))
    await userEvent.click(screen.getByRole('button', { name: 'sync.conflicts.title' }))
    await waitFor(() => expect(onReviewConflicts).toHaveBeenCalledOnce())
    expect(screen.queryByText('sync.center.title')).not.toBeInTheDocument()
  })
})
