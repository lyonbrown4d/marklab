import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n/setup'
import { GitRemoteDialog } from '@/features/git/worktree/GitRemoteDialog'
import type { GitRemoteStatus } from '@/services/gitApi'
const remote: GitRemoteStatus = {
  remotes: [{ name: 'origin', fetch_url: null, push_url: null }],
  branch: 'main',
  upstream: null,
  ahead: 0,
  behind: 0,
  detached: false,
}
describe('remote editor guards', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US')
  })
  it('keeps configuration immutable and prevents closing while an operation is pending', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <GitRemoteDialog
        open
        onOpenChange={onOpenChange}
        status={remote}
        busy
        error={null}
        onSave={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Remote name' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Remote URL' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
  })
  it('handles remotes without URLs and validates both name and URL', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <GitRemoteDialog
        open
        onOpenChange={vi.fn()}
        status={remote}
        busy={false}
        error={null}
        onSave={onSave}
        onRemove={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('textbox', { name: 'Remote URL' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save remote' })).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: 'Remote URL' }),
      'https://example.com/repo.git',
    )
    await user.clear(screen.getByRole('textbox', { name: 'Remote name' }))
    expect(screen.getByRole('button', { name: 'Save remote' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Remote name' }), ' origin ')
    await user.click(screen.getByRole('button', { name: 'Save remote' }))
    expect(onSave).toHaveBeenCalledWith('origin', 'https://example.com/repo.git')
  })
  it('supports adding the first remote while the remote list is empty', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <GitRemoteDialog
        open
        onOpenChange={vi.fn()}
        status={undefined}
        busy={false}
        error="Cannot read remotes"
        onSave={onSave}
        onRemove={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Cannot read remotes')
    await user.type(
      screen.getByRole('textbox', { name: 'Remote URL' }),
      'https://example.com/repo.git',
    )
    await user.click(screen.getByRole('button', { name: 'Save remote' }))
    expect(onSave).toHaveBeenCalledWith('origin', 'https://example.com/repo.git')
  })
})
