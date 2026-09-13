vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'fileOperation.cancel': 'Cancel',
        'fileOperation.nameRequired': 'Enter a name to continue.',
        'fileOperation.working': 'Working...',
        'context.actionFailed': 'Action failed',
      })[key] ?? key,
  }),
}))
import { act, render, screen, waitFor } from '@testing-library/react'
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

const deferredOperation = () => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('async file operations', () => {
  it('waits for creation and prevents duplicate submission or dismissal', async () => {
    const user = userEvent.setup()
    const operation = deferredOperation()
    const onSubmit = vi.fn(() => operation.promise)
    const onOpenChange = vi.fn()
    render(
      <FileNameDialog
        open
        title="Create file"
        description="File name"
        defaultValue="Draft.md"
        confirmLabel="Create"
        onSubmit={onSubmit}
        onOpenChange={onOpenChange}
      />,
    )
    await user.dblClick(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Draft.md')
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    await act(async () => {
      operation.resolve()
      await operation.promise
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false))
  })

  it('keeps the entered name on creation failure and allows correction and retry', async () => {
    const user = userEvent.setup()
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('File already exists'))
      .mockResolvedValueOnce(undefined)
    const onOpenChange = vi.fn()
    render(
      <FileNameDialog
        open
        title="Create file"
        description="File name"
        defaultValue="Draft.md"
        confirmLabel="Create"
        onSubmit={onSubmit}
        onOpenChange={onOpenChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('File already exists')
    expect(screen.getByRole('textbox')).toHaveValue('Draft.md')
    expect(screen.getByRole('textbox')).toBeEnabled()
    expect(onOpenChange).not.toHaveBeenCalled()
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'New.md{Enter}')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false))
    expect(onSubmit).toHaveBeenLastCalledWith('New.md')
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('waits for deletion and prevents duplicate confirmation or dismissal', async () => {
    const user = userEvent.setup()
    const operation = deferredOperation()
    const onConfirm = vi.fn(() => operation.promise)
    const onOpenChange = vi.fn()
    render(
      <FileConfirmDialog
        open
        title="Delete file"
        description="Delete Draft.md?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    )
    await user.dblClick(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
    await act(async () => {
      operation.resolve()
      await operation.promise
    })
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('keeps deletion failures visible and allows retry', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce(undefined)
    const onOpenChange = vi.fn()
    render(
      <FileConfirmDialog
        open
        title="Delete file"
        description="Delete Draft.md?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
    expect(onOpenChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
  })
})

describe('file operation focus restoration', () => {
  it.each(['name', 'confirm'])(
    'allows the %s dialog caller to restore focus after dismissal',
    async (kind) => {
      const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
      const props = {
        title: 'Operation',
        description: 'Operation details',
        confirmLabel: 'Confirm',
        onOpenChange: vi.fn(),
        onCloseAutoFocus,
      }
      const dialog = (open: boolean) =>
        kind === 'name' ? (
          <FileNameDialog {...props} open={open} defaultValue="Draft.md" onSubmit={vi.fn()} />
        ) : (
          <FileConfirmDialog {...props} open={open} onConfirm={vi.fn()} />
        )
      const { rerender } = render(dialog(true))
      expect(screen.getByRole('dialog')).toBeVisible()
      rerender(dialog(false))
      await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1))
    },
  )
})
