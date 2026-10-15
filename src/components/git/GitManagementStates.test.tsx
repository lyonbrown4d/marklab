import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  managementApi,
  renderManagement,
  resetManagementMocks,
} from '@/components/git/managementTestFixtures'
import { GitActionDialog } from '@/components/git/GitActionDialog'
import { GitManagementDialog } from '@/components/git/GitManagementDialog'

beforeEach(resetManagementMocks)

describe('Git management request and focus states', () => {
  it('keeps confirmation open while pending, exposes busy text and allows Escape after completion', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const props = {
      title: 'Confirm Git change',
      description: 'A repository operation',
      onCancel,
      onConfirm,
    }
    const { rerender } = renderManagement(
      <GitActionDialog {...props} pending error="Failure details" />,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Failure details')
    expect(screen.getByRole('button', { name: 'Git operation in progress…' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    rerender(<GitActionDialog {...props} pending={false} />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('disables actions until operation state succeeds and allows retry after an operation-state error', async () => {
    managementApi.getOperationState
      .mockRejectedValueOnce('Operation state unavailable')
      .mockResolvedValue({ operation: null })
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderManagement(<GitManagementDialog open rootPath="/repo" onOpenChange={onOpenChange} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Operation state unavailable')
    expect(await screen.findByRole('button', { name: 'Actions for aaaaaaa' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for aaaaaaa' })).toBeEnabled(),
    )
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('selects renamed files for the right old-path diff and handles empty commits', async () => {
    managementApi.getCommitFiles.mockResolvedValue([
      { path: 'note.md', status: 'modified' },
      { path: 'renamed.md', old_path: 'draft.md', status: 'renamed' },
    ])
    const user = userEvent.setup()
    renderManagement(<GitManagementDialog open rootPath="/repo" onOpenChange={() => {}} />)
    await user.click(await screen.findByRole('button', { name: /draft.md → renamed.md/ }))
    expect(managementApi.getCommitDiff).toHaveBeenCalledWith(
      'a'.repeat(40),
      'renamed.md',
      'draft.md',
    )
    expect(await screen.findByLabelText('Changes in renamed.md')).toHaveTextContent('+new line')
  })

  it('shows an empty commit file list without requesting a diff', async () => {
    managementApi.getCommitFiles.mockResolvedValue([])
    renderManagement(<GitManagementDialog open rootPath="/repo" onOpenChange={() => {}} />)
    expect(await screen.findByText('No entries.')).toBeInTheDocument()
    expect(managementApi.getCommitDiff).not.toHaveBeenCalled()
  })

  it('keeps a failed stash-drop confirmation open and preserves the entry', async () => {
    managementApi.dropStash.mockRejectedValue('Stash no longer exists')
    const user = userEvent.setup()
    renderManagement(<GitManagementDialog open rootPath="/repo" onOpenChange={() => {}} />)
    await user.click(screen.getByRole('tab', { name: 'Stash' }))
    await user.click(await screen.findByRole('button', { name: 'Drop' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Stash no longer exists')
    expect(screen.getByRole('dialog', { name: 'Drop' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByText('Draft note')).toBeInTheDocument()
  })
})
