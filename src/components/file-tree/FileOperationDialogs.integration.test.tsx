import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FileConfirmDialog, FileNameDialog } from '@/components/file-tree/FileOperationDialogs'

describe('File operation dialogs integration', () => {
  it('submits a trimmed file name and closes the dialog', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <FileNameDialog
        open
        title="Create file"
        description="Create a markdown file."
        confirmLabel="Create"
        defaultValue="Draft.md"
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '  Notes.md  ')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith('Notes.md')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('blocks empty file names before submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <FileNameDialog
        open
        title="Rename file"
        description="Rename this file."
        confirmLabel="Rename"
        defaultValue="Draft.md"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    await user.clear(screen.getByRole('textbox'))

    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('confirms destructive file operations explicitly', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <FileConfirmDialog
        open
        title="Delete file"
        description="This cannot be undone."
        confirmLabel="Delete"
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
