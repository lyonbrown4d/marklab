import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  managementApi,
  renderManagement,
  resetManagementMocks,
  commit,
} from '@/components/git/managementTestFixtures'
import { GitManagementDialog } from '@/components/git/GitManagementDialog'

beforeEach(resetManagementMocks)
const showTab = async (name: string) => {
  const user = userEvent.setup()
  const result = renderManagement(
    <GitManagementDialog open rootPath="/repo" onOpenChange={() => {}} />,
  )
  await user.click(screen.getByRole('tab', { name }))
  return { user, ...result }
}

describe('Git branches', () => {
  it('creates a remote-based local branch without passing the remote ref as its name', async () => {
    const { user } = await showTab('Branches')
    await user.click(await screen.findByRole('button', { name: 'Create local branch' }))
    expect(screen.getByRole('textbox', { name: 'New branch name' })).toHaveValue('topic')
    expect(screen.getByRole('textbox', { name: 'Start point (optional)' })).toHaveValue(
      'origin/topic',
    )
    await user.click(screen.getByRole('button', { name: 'Create branch' }))
    await waitFor(() =>
      expect(managementApi.createBranch).toHaveBeenCalledWith('topic', 'origin/topic'),
    )
    expect(screen.getByRole('textbox', { name: 'New branch name' })).toHaveValue('')
    expect(managementApi.switchBranch).not.toHaveBeenCalled()
  })

  it('creates a branch at HEAD and only switches existing local branches', async () => {
    const { user } = await showTab('Branches')
    await user.type(screen.getByRole('textbox', { name: 'New branch name' }), 'draft')
    await user.click(screen.getByRole('button', { name: 'Create branch' }))
    await waitFor(() => expect(managementApi.createBranch).toHaveBeenCalledWith('draft', undefined))
    await user.click(await screen.findByRole('button', { name: 'Switch' }))
    expect(managementApi.switchBranch).toHaveBeenCalledWith('feature')
  })

  it('confirms branch deletion and requires an explicit force toggle', async () => {
    const { user } = await showTab('Branches')
    expect(await screen.findByText('Current')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(managementApi.deleteBranch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: /Force deletion/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.deleteBranch).toHaveBeenCalledWith('feature', true)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument(),
    )
  })

  it('defaults deletion to safe mode and keeps failures inside the confirmation', async () => {
    managementApi.deleteBranch.mockRejectedValue(new Error('Branch is not merged'))
    const { user } = await showTab('Branches')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.deleteBranch).toHaveBeenCalledWith('feature', false)
    expect(await screen.findByRole('alert')).toHaveTextContent('Branch is not merged')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it.each(['Merge', 'Rebase'] as const)(
    'confirms %s of the selected ref into the current branch',
    async (type) => {
      const { user } = await showTab('Branches')
      await user.click((await screen.findAllByRole('button', { name: type }))[0])
      expect(screen.getByRole('dialog', { name: type })).toHaveTextContent('main')
      expect(screen.getByRole('dialog', { name: type })).toHaveTextContent('feature')
      await user.click(screen.getByRole('button', { name: 'Confirm' }))
      expect(type === 'Merge' ? managementApi.merge : managementApi.rebase).toHaveBeenCalledWith(
        'feature',
      )
    },
  )

  it('exposes a failed branch load with a retry', async () => {
    managementApi.getBranches
      .mockRejectedValueOnce(new Error('Branches unavailable'))
      .mockResolvedValue([])
    const { user } = await showTab('Branches')
    expect(await screen.findByRole('alert')).toHaveTextContent('Branches unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No entries.')).toBeInTheDocument()
  })
})

describe('Git stash', () => {
  it('saves an optional message, applies while retaining the entry, and confirms drop', async () => {
    const { user, client } = await showTab('Stash')
    await user.type(screen.getByRole('textbox', { name: 'Stash message (optional)' }), 'checkpoint')
    await user.click(screen.getByRole('button', { name: 'Save stash' }))
    await waitFor(() => expect(managementApi.saveStash).toHaveBeenCalledWith('checkpoint'))
    await user.click(await screen.findByRole('button', { name: 'Apply' }))
    await waitFor(() =>
      expect(managementApi.applyStash).toHaveBeenCalledWith('stash@{0}', commit.hash),
    )
    expect(screen.getByText('Draft note')).toBeInTheDocument()
    expect(client.getQueryData(['git-stashes', '/repo'])).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Drop' }))
    expect(managementApi.dropStash).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(managementApi.dropStash).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Drop' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(managementApi.dropStash).toHaveBeenCalledWith('stash@{0}', commit.hash)
  })

  it('handles save failures and prevents duplicate submissions while pending', async () => {
    let reject: ((reason: Error) => void) | undefined
    managementApi.saveStash.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    const { user } = await showTab('Stash')
    await user.click(await screen.findByRole('button', { name: 'Save stash' }))
    await user.click(screen.getByRole('button', { name: 'Save stash' }))
    expect(managementApi.saveStash).toHaveBeenCalledTimes(1)
    expect(managementApi.saveStash).toHaveBeenCalledWith(undefined)
    expect(screen.getByRole('textbox', { name: 'Stash message (optional)' })).toBeDisabled()
    reject?.(new Error('Stash save failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Stash save failed')
    expect(screen.getByRole('button', { name: 'Save stash' })).toBeEnabled()
  })

  it('handles failed stash loading and failed apply', async () => {
    managementApi.getStashes.mockRejectedValueOnce(new Error('Stashes unavailable'))
    managementApi.applyStash.mockRejectedValue(new Error('Stash conflicts'))
    const { user } = await showTab('Stash')
    expect(await screen.findByRole('alert')).toHaveTextContent('Stashes unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await user.click(await screen.findByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Stash conflicts')
  })
})
