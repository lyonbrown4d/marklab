import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GitCommitDialog } from '@/components/GitCommitDialog'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const renderDialog = (props?: Partial<ComponentProps<typeof GitCommitDialog>>) => {
  const onOpenChange = vi.fn()
  const onMessageChange = vi.fn()
  const onCommit = vi.fn()

  render(
    <GitCommitDialog
      open
      branch="main"
      changedFilesCount={2}
      message=""
      onOpenChange={onOpenChange}
      onMessageChange={onMessageChange}
      onCommit={onCommit}
      canCommit
      isCommitting={false}
      error={null}
      {...props}
    />,
  )

  return {
    onCommit,
    onMessageChange,
    onOpenChange,
  }
}

describe('GitCommitDialog integration', () => {
  beforeEach(async () => {
    localStorage.clear()
    usePreferencesStore.setState({ locale: 'en-US' })
    await i18n.changeLanguage('en-US')
  })

  it('keeps commit disabled until the user enters a message', async () => {
    const user = userEvent.setup()
    const handlers = renderDialog()

    const messageInput = screen.getByRole('textbox', { name: 'Commit message' })
    const commitButton = screen.getByRole('button', { name: 'Stage and commit all changes' })

    expect(messageInput).toHaveAccessibleDescription('Describe the change')
    expect(commitButton).toBeDisabled()

    await user.type(messageInput, 'Add UI integration tests')
    await user.click(commitButton)

    expect(handlers.onMessageChange).toHaveBeenLastCalledWith('Add UI integration tests')
    expect(handlers.onCommit).toHaveBeenCalledTimes(1)
  })

  it('prevents commit while conflicts block the repository state', () => {
    const handlers = renderDialog({
      canCommit: false,
      disabledReason: 'Resolve merge conflicts before committing.',
      message: 'Try commit',
    })

    const commitButton = screen.getByRole('button', { name: 'Stage and commit all changes' })
    const disabledReason = screen.getByText('Resolve merge conflicts before committing.')

    expect(disabledReason.closest('[role="alert"]')).toBeInTheDocument()
    expect(commitButton).toBeDisabled()
    expect(commitButton).toHaveAccessibleDescription('Resolve merge conflicts before committing.')
    expect(handlers.onCommit).not.toHaveBeenCalled()
  })

  it('surfaces commit errors without closing the dialog', () => {
    const handlers = renderDialog({
      error: 'Git author identity is missing.',
      message: 'Try commit',
    })

    const commitButton = screen.getByRole('button', { name: 'Stage and commit all changes' })
    const error = screen.getByText('Git author identity is missing.')

    expect(error.closest('[role="alert"]')).toBeInTheDocument()
    expect(commitButton).toHaveAccessibleDescription('Git author identity is missing.')
    expect(handlers.onOpenChange).not.toHaveBeenCalled()
  })

  it('marks the dialog busy and keeps the loading icon decorative while committing', () => {
    renderDialog({
      canCommit: false,
      isCommitting: true,
      message: 'Commit in progress',
    })

    expect(screen.getByRole('dialog', { name: 'Commit all changes' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Committing' })).toBeDisabled()
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })
})
