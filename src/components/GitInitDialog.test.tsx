import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GitInitDialog } from '@/components/GitInitDialog'
import { GitRepositoryEmptyState } from '@/components/GitRepositoryEmptyState'

const labels: Record<string, string> = {
  'scm.cancel': 'Cancel',
  'scm.init': 'Initialize repository',
  'scm.initConfirm': 'Create a Git repository in this workspace.',
  'scm.initializing': 'Initializing repository',
  'scm.notRepositoryHelp': 'Create a repository before using source control.',
  'scm.notRepositoryTitle': 'No Git repository',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => labels[key] ?? key,
  }),
}))

describe('GitInitDialog', () => {
  it('exposes a named confirmation dialog and calls confirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <GitInitDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isInitializing={false}
        error={null}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Initialize repository' })).toBeInTheDocument()
    expect(screen.getByText('Create a Git repository in this workspace.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Initialize repository' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('announces initialization state and disables dialog actions', () => {
    render(
      <GitInitDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isInitializing error={null} />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Initialize repository' })
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Initializing repository')
    expect(screen.getByRole('button', { name: 'Initializing repository' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('announces initialization errors', () => {
    render(
      <GitInitDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInitializing={false}
        error="git init failed"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('git init failed')
  })
})

describe('GitRepositoryEmptyState', () => {
  it('opens the initialization dialog from the empty state', async () => {
    const user = userEvent.setup()
    const onOpenInitDialog = vi.fn()

    render(
      <GitRepositoryEmptyState
        isInitializing={false}
        initError={null}
        onOpenInitDialog={onOpenInitDialog}
      />,
    )

    expect(screen.getByText('No Git repository')).toBeInTheDocument()
    expect(screen.getByText('Create a repository before using source control.')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="empty"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="empty-icon"]')).toBeInTheDocument()

    const initButton = screen.getByRole('button', { name: 'Initialize repository' })
    expect(initButton).toHaveAttribute('type', 'button')

    await user.click(initButton)
    expect(onOpenInitDialog).toHaveBeenCalledTimes(1)
  })

  it('links the init button to initialization errors and exposes busy state', () => {
    render(
      <GitRepositoryEmptyState
        isInitializing
        initError="workspace is read-only"
        onOpenInitDialog={vi.fn()}
      />,
    )

    const initButton = screen.getByRole('button', { name: 'Initializing repository' })
    const describedBy = initButton.getAttribute('aria-describedby')

    expect(initButton).toBeDisabled()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent('workspace is read-only')
    expect(screen.getByRole('alert')).toHaveTextContent('workspace is read-only')
    expect(screen.getByRole('status')).toHaveTextContent('Initializing repository')
  })
})
