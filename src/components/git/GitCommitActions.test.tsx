import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  commit,
  managementApi,
  renderManagement,
  resetManagementMocks,
} from '@/components/git/managementTestFixtures'
import { GitManagementDialog } from '@/components/git/GitManagementDialog'

beforeEach(resetManagementMocks)
const openCommitAction = async (label: string) => {
  const user = userEvent.setup()
  renderManagement(<GitManagementDialog open rootPath="/repo" onOpenChange={() => {}} />)
  const action = await screen.findByRole('button', { name: 'Actions for aaaaaaa' })
  await waitFor(() => expect(action).toBeEnabled())
  await user.click(action)
  await user.click(screen.getByRole('menuitem', { name: label }))
  return user
}

describe('Commit actions', () => {
  it('reverts with an inverse commit after confirmation', async () => {
    const user = await openCommitAction('Revert commit')
    expect(screen.getByRole('dialog', { name: 'Revert commit' })).toHaveTextContent(
      'Existing history is preserved',
    )
    expect(managementApi.revert).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.revert).toHaveBeenCalledWith(commit.hash, undefined)
    expect(managementApi.reset).not.toHaveBeenCalled()
  })

  it('requires an explicit parent for reverting a merge commit', async () => {
    managementApi.getHistory.mockResolvedValue([
      { ...commit, parents: ['b'.repeat(40), 'c'.repeat(40)] },
    ])
    const user = await openCommitAction('Revert commit')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: 'Parent to keep' }))
    await user.click(screen.getByRole('option', { name: 'Parent 2 · cccccccc' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.revert).toHaveBeenCalledWith(commit.hash, 2)
  })

  it('cherry-picks the chosen commit and surfaces failures within the dialog', async () => {
    managementApi.cherryPick
      .mockRejectedValueOnce(new Error('Cherry-pick conflicts'))
      .mockResolvedValue({})
    const user = await openCommitAction('Cherry-pick commit')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.cherryPick).toHaveBeenCalledWith(commit.hash)
    expect(await screen.findByRole('alert')).toHaveTextContent('Cherry-pick conflicts')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Cherry-pick commit' })).not.toBeInTheDocument(),
    )
  })

  it('defaults reset to soft and reports the recovery branch', async () => {
    const user = await openCommitAction('Reset to commit')
    expect(screen.getByRole('combobox', { name: 'Reset mode' })).toHaveTextContent(
      'Soft — keep changes staged',
    )
    expect(screen.getByRole('dialog', { name: 'Reset to commit' })).toHaveTextContent(
      'rewrites local history',
    )
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.reset).toHaveBeenCalledWith(commit.hash, 'soft')
    expect(
      await screen.findByText('Backup branch created: marklab-backup/previous'),
    ).toBeInTheDocument()
  })

  it('sends mixed mode without conflating it with hard discard', async () => {
    const user = await openCommitAction('Reset to commit')
    await user.click(screen.getByRole('combobox', { name: 'Reset mode' }))
    await user.click(screen.getByRole('option', { name: 'Mixed — keep files, unstage changes' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.reset).toHaveBeenCalledWith(commit.hash, 'mixed')
  })

  it('requires hard reset confirmation and resets acknowledgment after changing mode', async () => {
    const user = await openCommitAction('Reset to commit')
    await user.click(screen.getByRole('combobox', { name: 'Reset mode' }))
    await user.click(screen.getByRole('option', { name: 'Hard — discard changes' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I understand/ }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    await user.click(screen.getByRole('combobox', { name: 'Reset mode' }))
    await user.click(screen.getByRole('option', { name: 'Soft — keep changes staged' }))
    await user.click(screen.getByRole('combobox', { name: 'Reset mode' }))
    await user.click(screen.getByRole('option', { name: 'Hard — discard changes' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(managementApi.reset).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: /I understand/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.reset).toHaveBeenCalledWith(commit.hash, 'hard')
  })

  it('does not reset when confirmation is canceled and shows backend dirty guards', async () => {
    managementApi.reset.mockRejectedValue(new Error('Working tree must be clean'))
    const user = await openCommitAction('Reset to commit')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(managementApi.reset).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Actions for aaaaaaa' }))
    await user.click(screen.getByRole('menuitem', { name: 'Reset to commit' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Working tree must be clean')
  })

  it('shows errors for commit files and diff without hiding history', async () => {
    managementApi.getCommitFiles.mockRejectedValueOnce(new Error('Files unavailable'))
    managementApi.getCommitDiff.mockRejectedValueOnce(new Error('Diff unavailable'))
    const user = userEvent.setup()
    renderManagement(<GitManagementDialog open rootPath="/repo" onOpenChange={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Files unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Diff unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Changes in note.md')).toHaveTextContent('+new line')
  })
})
