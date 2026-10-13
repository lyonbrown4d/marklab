import type { RefObject } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSyncStatusControl } from '@/features/workspace-sync/WorkspaceSyncStatusControl'

vi.mock('@/app/nativeSurfaceOcclusion', () => ({ useNativeSurfaceOcclusion: vi.fn() }))
vi.mock('@/features/workspace-sync/SyncCenterPopover', () => ({
  SyncCenterPopover: ({
    triggerRef,
    onConfigure,
    onReviewConflicts,
  }: {
    triggerRef: RefObject<HTMLButtonElement | null>
    onConfigure: () => void
    onReviewConflicts: () => void
  }) => (
    <div>
      <button ref={triggerRef} onClick={onConfigure}>
        Configure sync
      </button>
      <button onClick={onReviewConflicts}>Review conflicts</button>
    </div>
  ),
}))
const { dialog } = vi.hoisted(() => ({
  dialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? (
      <div role="dialog" aria-label="Sync dialog">
        <button onClick={() => onOpenChange(true)}>Keep dialog open</button>
        <button onClick={() => onOpenChange(false)}>Close dialog</button>
      </div>
    ) : null,
}))
vi.mock('@/features/workspace-sync/WorkspaceSyncBindingDialog', () => ({
  WorkspaceSyncBindingDialog: dialog,
}))
vi.mock('@/features/workspace-sync/WorkspaceSyncConflictsDialog', () => ({
  WorkspaceSyncConflictsDialog: dialog,
}))

describe('sync status dialog coordination', () => {
  it.each(['Configure sync', 'Review conflicts'])(
    'keeps %s mounted on an open request and restores trigger focus after closing',
    async (action) => {
      render(
        <WorkspaceSyncStatusControl
          rootPath="/one"
          status={{
            webdav: { status: 'idle', label: 'Cloud', conflictCount: 0 },
            onStart: vi.fn(),
            onCancel: vi.fn(),
            loading: false,
            cancelPending: false,
            cancelError: null,
          }}
        />,
      )
      const trigger = screen.getByRole('button', { name: 'Configure sync' })
      await userEvent.click(screen.getByRole('button', { name: action }))
      await userEvent.click(screen.getByRole('button', { name: 'Keep dialog open' }))
      expect(screen.getByRole('dialog', { name: 'Sync dialog' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Keep dialog open' })).toHaveFocus()
      await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(trigger).toHaveFocus())
    },
  )
})
