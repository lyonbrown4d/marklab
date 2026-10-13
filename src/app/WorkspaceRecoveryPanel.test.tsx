import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceRecoveryPanel } from '@/app/WorkspaceRecoveryPanel'
import type { WorkspaceRestoreFailure } from '@/app/workspaceRestoreTypes'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const failure: WorkspaceRestoreFailure = {
  phase: 'root',
  rootPath: '/tmp/Notes',
  rootKind: 'external',
  detail: 'Directory not found',
  message: 'Failed to restore workspace root',
}

describe('WorkspaceRecoveryPanel', () => {
  it('shows the unavailable path and every recovery action without an editor loading state', () => {
    const onRecover = vi.fn(async () => undefined)
    const { container } = render(
      <WorkspaceRecoveryPanel
        failure={failure}
        busyAction={null}
        error={null}
        onRecover={onRecover}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('/tmp/Notes')
    expect(screen.getByRole('alert')).toHaveTextContent('Directory not found')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.querySelector('[data-editor-loading]')).toBeNull()
    for (const [label, action] of [
      ['app.restoreRetry', 'retry'],
      ['app.workspaceRecoveryRelocate', 'relocate'],
      ['app.workspaceRecoveryOpenAnother', 'open'],
      ['app.workspaceRecoveryUseDefault', 'internal'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(onRecover).toHaveBeenLastCalledWith(action)
    }
  })

  it('keeps the failed path visible and disables all actions during recovery', () => {
    const { container } = render(
      <WorkspaceRecoveryPanel
        failure={failure}
        busyAction="relocate"
        error={null}
        onRecover={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('/tmp/Notes')
    expect(screen.getByRole('status')).toHaveTextContent('app.workspaceRecoveryPending')
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(container.querySelector('[data-editor-loading]')).toBeNull()
  })

  it('shows an action error and re-enables the actions after failure', () => {
    render(
      <WorkspaceRecoveryPanel
        failure={failure}
        busyAction={null}
        error="Could not open directory"
        onRecover={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('alert')[1]).toHaveTextContent('Could not open directory')
    expect(screen.getByRole('button', { name: 'app.restoreRetry' })).toBeEnabled()
  })

  it('disables recovery while a statusbar retry is pending', () => {
    render(
      <WorkspaceRecoveryPanel
        failure={failure}
        busyAction={null}
        restoring
        error={null}
        onRecover={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'app.restoreRetry' })).toBeDisabled()
    expect(screen.getByRole('status')).toBeVisible()
  })
})
