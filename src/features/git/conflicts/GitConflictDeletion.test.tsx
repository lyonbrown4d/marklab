import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  conflictApi,
  conflictSnapshot,
  renderConflict,
  resetConflictMocks,
} from '@/features/git/conflicts/conflictTestFixtures'
import { GitConflictMergeView } from '@/components/git/GitConflictMergeView'

beforeEach(resetConflictMocks)
const show = async () => {
  renderConflict(
    <GitConflictMergeView
      rootPath="/repo"
      request={{ path: 'example.ts', section: 'conflicts' }}
      onClose={() => {}}
    />,
  )
  await screen.findByRole('textbox')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Use incoming file' })).toBeEnabled(),
  )
  return userEvent.setup()
}

describe('Conflict file deletion and empty files', () => {
  it('requires a deletion choice and confirmation before saving a deleted incoming side', async () => {
    conflictApi.getConflict.mockResolvedValue({ ...conflictSnapshot, theirs: null })
    const user = await show()
    await user.click(screen.getByRole('tab', { name: 'Incoming' }))
    expect(screen.getByText(/Incoming deleted this file/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use incoming file' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete conflicted file' })
    expect(conflictApi.saveConflict).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox')).toHaveValue(conflictSnapshot.result)
    await user.click(screen.getByRole('button', { name: 'Use incoming file' }))
    await user.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(
      screen.getByText('File deletion selected. Save will delete this file.'),
    ).toBeInTheDocument()
    expect(conflictApi.saveConflict).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save and stage' }))
    expect(conflictApi.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ content: '', deleteFile: true, stage: true }),
    )
  })

  it('treats an empty incoming blob as a retained empty file without deletion confirmation', async () => {
    conflictApi.getConflict.mockResolvedValue({ ...conflictSnapshot, theirs: '' })
    const user = await show()
    await user.click(screen.getByRole('button', { name: 'Use incoming file' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Save and stage' }))
    expect(conflictApi.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ content: '', deleteFile: false, stage: true }),
    )
  })

  it('does not silently stage a file absent from disk and supports explicitly keeping an empty file', async () => {
    conflictApi.getConflict.mockResolvedValue({
      ...conflictSnapshot,
      result: '',
      deleted: true,
      ours: null,
    })
    const user = await show()
    expect(screen.getByRole('button', { name: 'Save and stage' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Keep empty file' }))
    expect(screen.getByRole('button', { name: 'Save and stage' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save and stage' }))
    expect(conflictApi.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ content: '', deleteFile: false }),
    )
  })

  it('permits choosing a nondeleted current whole file and manually editing after deletion intent', async () => {
    conflictApi.getConflict.mockResolvedValue({ ...conflictSnapshot, theirs: null })
    const user = await show()
    await user.click(screen.getByRole('button', { name: 'Use current file' }))
    expect(screen.getByRole('textbox')).toHaveValue('current();\n')
    await user.click(screen.getByRole('button', { name: 'Use incoming file' }))
    await user.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await user.type(screen.getByRole('textbox'), 'recreated();')
    expect(
      screen.queryByText('File deletion selected. Save will delete this file.'),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(conflictApi.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'recreated();', deleteFile: false }),
    )
  })
})
