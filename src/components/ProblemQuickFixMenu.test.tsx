import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProblemQuickFixMenu } from '@/components/ProblemQuickFixMenu'
import { RightSidebarProblemsPanel } from '@/components/RightSidebarProblemsPanel'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const problem: MarkdownSourceDiagnostic = {
  id: 'diagnostic',
  line: 1,
  startColumn: 1,
  endColumn: 5,
  severity: 'error',
  message: 'Missing note',
}
const action: MarkdownLanguageCodeAction = {
  kind: 'create-file',
  title: 'Create note',
  path: 'note.md',
}
const newerAction = { ...action, title: 'Create newer note', path: 'newer.md' }
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
const setup = () => ({
  user: userEvent.setup(),
  onGetActions:
    vi.fn<(problem: MarkdownSourceDiagnostic) => Promise<MarkdownLanguageCodeAction[]>>(),
  onApply:
    vi.fn<
      (problem: MarkdownSourceDiagnostic, action: MarkdownLanguageCodeAction) => Promise<boolean>
    >(),
})
const openMenu = async (user: ReturnType<typeof userEvent.setup>, message = problem.message) => {
  await user.click(screen.getByRole('button', { name: `actions.more: ${message}` }))
}
const closeMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
}

describe('ProblemQuickFixMenu', () => {
  it('invalidates a pending load when diagnostic fields change even with the same id', async () => {
    const { user, onApply, onGetActions } = setup()
    const pending = deferred<MarkdownLanguageCodeAction[]>()
    onGetActions.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([newerAction])
    const view = render(
      <ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />,
    )
    await openMenu(user)
    const next = { ...problem, message: 'New problem' }
    view.rerender(
      <ProblemQuickFixMenu problem={next} onApply={onApply} onGetActions={onGetActions} />,
    )
    await openMenu(user, next.message)
    expect(await screen.findByRole('menuitem', { name: newerAction.title })).toBeVisible()
    await act(async () => pending.resolve([action]))
    expect(screen.queryByRole('menuitem', { name: action.title })).not.toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('clears previous actions while reopening and cannot apply them during reload', async () => {
    const { user, onApply, onGetActions } = setup()
    const pending = deferred<MarkdownLanguageCodeAction[]>()
    onGetActions.mockResolvedValueOnce([action]).mockReturnValueOnce(pending.promise)
    render(<ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />)
    await openMenu(user)
    expect(await screen.findByRole('menuitem', { name: action.title })).toBeVisible()
    await closeMenu(user)
    await openMenu(user)
    expect(screen.queryByRole('menuitem', { name: action.title })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(onApply).not.toHaveBeenCalled()
    await act(async () => pending.resolve([newerAction]))
    expect(await screen.findByRole('menuitem', { name: newerAction.title })).toBeVisible()
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores stale apply %s after close and reopen',
    async (settlement) => {
      const { user, onApply, onGetActions } = setup()
      const pending = deferred<boolean>()
      const load = deferred<MarkdownLanguageCodeAction[]>()
      onApply.mockReturnValueOnce(pending.promise)
      onGetActions.mockResolvedValueOnce([action]).mockReturnValueOnce(load.promise)
      render(
        <ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />,
      )
      await openMenu(user)
      await user.click(await screen.findByRole('menuitem', { name: action.title }))
      expect(onApply).toHaveBeenCalledExactlyOnceWith(problem, action)
      expect(screen.getByRole('menu')).toBeVisible()
      expect(screen.queryByRole('menuitem', { name: action.title })).not.toBeInTheDocument()
      await closeMenu(user)
      await openMenu(user)
      await act(async () => {
        if (settlement === 'resolve') pending.resolve(true)
        else pending.reject(new Error('Stale failure'))
      })
      expect(screen.getByRole('menu')).toBeVisible()
      expect(screen.queryByText('Stale failure')).not.toBeInTheDocument()
      expect(screen.getByRole('menu')).toHaveAttribute('aria-busy', 'true')
      await act(async () => load.resolve([newerAction]))
      expect(await screen.findByRole('menuitem', { name: newerAction.title })).toBeVisible()
    },
  )

  it('ignores an apply completion after a problem change', async () => {
    const { user, onApply, onGetActions } = setup()
    const pending = deferred<boolean>()
    onApply.mockReturnValueOnce(pending.promise)
    onGetActions.mockResolvedValue([action])
    const view = render(
      <ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />,
    )
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: action.title }))
    const next = { ...problem, line: 2 }
    view.rerender(
      <ProblemQuickFixMenu problem={next} onApply={onApply} onGetActions={onGetActions} />,
    )
    await openMenu(user)
    await act(async () => pending.resolve(true))
    expect(await screen.findByRole('menuitem', { name: action.title })).toBeVisible()
  })

  it('keeps apply failures visible and clears them when reloading', async () => {
    const { user, onApply, onGetActions } = setup()
    onGetActions.mockResolvedValue([action])
    onApply.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce(true)
    render(<ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />)
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: action.title }))
    expect(await screen.findByText('Permission denied')).toBeVisible()
    await closeMenu(user)
    await openMenu(user)
    expect(screen.queryByText('Permission denied')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: action.title }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('keeps load failures visible and clears them on diagnostic change', async () => {
    const { user, onApply, onGetActions } = setup()
    onGetActions.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([])
    const view = render(
      <ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />,
    )
    await openMenu(user)
    expect(await screen.findByText('Offline')).toBeVisible()
    view.rerender(
      <ProblemQuickFixMenu
        problem={{ ...problem, endColumn: 6 }}
        onApply={onApply}
        onGetActions={onGetActions}
      />,
    )
    await openMenu(user)
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('ignores rejected loads after a diagnostic is replaced', async () => {
    const { user, onApply, onGetActions } = setup()
    const pending = deferred<MarkdownLanguageCodeAction[]>()
    onGetActions.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([newerAction])
    const view = render(
      <ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />,
    )
    await openMenu(user)
    view.rerender(
      <ProblemQuickFixMenu
        problem={{ ...problem, code: 'updated' }}
        onApply={onApply}
        onGetActions={onGetActions}
      />,
    )
    await openMenu(user)
    await act(async () => pending.reject(new Error('Old load failed')))
    expect(await screen.findByRole('menuitem', { name: newerAction.title })).toBeVisible()
    expect(screen.queryByText('Old load failed')).not.toBeInTheDocument()
  })

  it('shows a failure when applying returns false', async () => {
    const { user, onApply, onGetActions } = setup()
    onGetActions.mockResolvedValue([action])
    onApply.mockResolvedValue(false)
    render(<ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />)
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: action.title }))
    expect(await screen.findByText('context.actionFailed')).toBeVisible()
    expect(screen.getByRole('menu')).toHaveAttribute('aria-busy', 'false')
  })

  it('also displays synchronous callback failures', async () => {
    const { user, onApply, onGetActions } = setup()
    onGetActions
      .mockImplementationOnce(() => {
        throw new Error('Load failed')
      })
      .mockResolvedValueOnce([action])
    onApply.mockImplementationOnce(() => {
      throw new Error('Apply failed')
    })
    render(<ProblemQuickFixMenu problem={problem} onApply={onApply} onGetActions={onGetActions} />)
    await openMenu(user)
    expect(await screen.findByText('Load failed')).toBeVisible()
    await closeMenu(user)
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: action.title }))
    expect(await screen.findByText('Apply failed')).toBeVisible()
  })

  it('resets identical diagnostics when switching documents in the sidebar', async () => {
    const { user, onApply, onGetActions } = setup()
    onGetActions.mockResolvedValue([action])
    const props = {
      targetLabel: 'Note',
      problems: [problem],
      errorProblems: [problem],
      warningProblems: [],
      onOpenProblem: vi.fn(),
      onGetProblemActions: onGetActions,
      onApplyProblemAction: onApply,
    }
    const view = render(<RightSidebarProblemsPanel {...props} targetPath="first.md" />)
    await openMenu(user)
    expect(await screen.findByRole('menuitem', { name: action.title })).toBeVisible()
    view.rerender(<RightSidebarProblemsPanel {...props} targetPath="second.md" />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })
})
