import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  managementApi,
  facade,
  renderManagement,
  resetManagementMocks,
  commit,
} from '@/components/git/managementTestFixtures'
import { GitManagementDialog } from '@/components/git/GitManagementDialog'

beforeEach(resetManagementMocks)
const renderDialog = (rootPath = '/repo') => {
  const onOpenChange = vi.fn()
  return {
    ...renderManagement(
      <GitManagementDialog open rootPath={rootPath} onOpenChange={onOpenChange} />,
    ),
    onOpenChange,
  }
}

describe('GitManagementDialog', () => {
  it('shows unavailable historical previews without generating an empty text patch', async () => {
    managementApi.getCommitDiff.mockResolvedValue({
      path: 'note.md',
      original_label: 'HEAD~1',
      modified_label: 'HEAD',
      original_content: '',
      modified_content: '',
      unavailable_reason: 'binary',
    })
    renderDialog()
    expect(await screen.findByRole('status', { name: 'Text diff unavailable' })).toHaveTextContent(
      'Binary files cannot be compared as text.',
    )
    expect(screen.queryByLabelText('Changes in note.md')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('releases full historical file contents when the preview closes', async () => {
    const { client, unmount } = renderDialog()
    await screen.findByLabelText('Changes in note.md')
    const key = ['git-commit-diff', '/repo', commit.hash, 'note.md', undefined]
    expect(client.getQueryData(key)).toBeDefined()
    unmount()
    await waitFor(() => expect(client.getQueryData(key)).toBeUndefined())
    client.clear()
  })

  it('loads history, files and a readable actual diff in the workspace scope', async () => {
    const { client } = renderDialog()
    expect(await screen.findByText('Add note')).toBeInTheDocument()
    const diff = await screen.findByLabelText('Changes in note.md')
    expect(diff).toHaveTextContent('-old line')
    expect(diff).toHaveTextContent('+new line')
    expect(managementApi.getHistory).toHaveBeenCalledWith({ limit: 50, skip: 0 })
    expect(managementApi.getCommitFiles).toHaveBeenCalledWith(commit.hash)
    expect(managementApi.getCommitDiff).toHaveBeenCalledWith(commit.hash, 'note.md', undefined)
    expect(facade).toHaveBeenCalledWith('/repo')
    expect(client.getQueryData(['git-history', '/repo'])).toBeDefined()
  })

  it('paginates in groups of 50 and keeps commits selectable', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      ...commit,
      hash: String(index).padStart(40, '0'),
      subject: `Commit ${index}`,
    }))
    managementApi.getHistory
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ ...commit, subject: 'Older commit' }])
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: 'Load 50 more commits' }))
    expect(await screen.findByRole('button', { name: /Older commit/ })).toBeInTheDocument()
    expect(managementApi.getHistory).toHaveBeenLastCalledWith({ limit: 50, skip: 50 })
    await user.click(screen.getByRole('button', { name: /Older commit/ }))
    expect(managementApi.getCommitFiles).toHaveBeenCalledWith(commit.hash)
    expect(screen.queryByRole('button', { name: 'Load 50 more commits' })).not.toBeInTheDocument()
  })

  it('shows empty history and explicit errors with retry', async () => {
    managementApi.getHistory
      .mockRejectedValueOnce(new Error('History unavailable'))
      .mockResolvedValue([])
    const user = userEvent.setup()
    renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No entries.')).toBeInTheDocument()
  })

  it('keeps unfinished operation context visible and blocks all mutations', async () => {
    managementApi.getOperationState.mockResolvedValue({ operation: 'rebase' })
    const user = userEvent.setup()
    renderDialog()
    expect(await screen.findByRole('status')).toHaveTextContent('Rebase is unfinished')
    expect(await screen.findByRole('button', { name: 'Actions for aaaaaaa' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Branches' }))
    expect(await screen.findByRole('button', { name: 'Switch' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Stash' }))
    expect(await screen.findByRole('button', { name: 'Save stash' })).toBeDisabled()
  })

  it('allows keyboard navigation between tabs and guards Close and Escape during a mutation', async () => {
    let finish: ((value: unknown) => void) | undefined
    managementApi.saveStash.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const user = userEvent.setup()
    const { onOpenChange } = renderDialog()
    await screen.findByRole('button', { name: 'Actions for aaaaaaa' })
    screen.getByRole('tab', { name: 'History' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Branches' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    await user.click(await screen.findByRole('button', { name: 'Save stash' }))
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    finish?.({})
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('clears selected commits when switching repositories', async () => {
    const { rerender, client } = renderDialog('/repo')
    await screen.findByLabelText('Changes in note.md')
    managementApi.getHistory.mockResolvedValue([
      { ...commit, hash: 'd'.repeat(40), subject: 'Other workspace commit' },
    ])
    const { QueryClientProvider } = await import('@tanstack/react-query')
    rerender(
      <QueryClientProvider client={client}>
        <GitManagementDialog open rootPath="/other" onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(
      await screen.findByRole('button', { name: /Other workspace commit/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Add note/ })).not.toBeInTheDocument()
    expect(facade).toHaveBeenCalledWith('/other')
  })
})
