import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStatusBarEdgeHandle } from '@/components/AppStatusBarEdgeHandle'
import { useStatusCenterSummaryStore } from '@/store/useStatusCenterSummaryStore'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: { count?: number }) =>
      ({
        'statusBar.hide': 'Hide status bar',
        'statusBar.show': 'Show status bar',
        'statusBar.showWithActiveTasks': `Show status bar, ${options?.count ?? 0} active tasks`,
        'statusBar.showWithIssues': `Show status bar, ${options?.count ?? 0} issues`,
      })[key] ?? key,
  }),
}))

describe('AppStatusBarEdgeHandle', () => {
  beforeEach(() => {
    useStatusCenterSummaryStore.setState({ activeCount: 0, issueCount: 0 })
  })

  it('opens the collapsed status bar only after a click', () => {
    const onToggle = vi.fn()
    render(<AppStatusBarEdgeHandle open={false} onToggle={onToggle} />)

    const button = screen.getByRole('button', { name: 'Show status bar' })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    fireEvent.pointerEnter(button)
    expect(onToggle).not.toHaveBeenCalled()

    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('exposes the expanded state as a bottom edge handle', () => {
    render(<AppStatusBarEdgeHandle open onToggle={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Hide status bar' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('data-edge', 'bottom')
  })

  it('keeps active background work discoverable while the status bar is collapsed', () => {
    render(
      <AppStatusBarEdgeHandle
        open={false}
        summary={{ activeCount: 3, issueCount: 0 }}
        onToggle={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', {
      name: 'Show status bar, 3 active tasks',
    })
    expect(button).toHaveAttribute('data-status', 'active')
    expect(button).toHaveTextContent('3')
    expect(screen.getByRole('status')).toHaveTextContent('Show status bar, 3 active tasks')
  })

  it('prioritizes issues over active work in the collapsed summary', () => {
    render(
      <AppStatusBarEdgeHandle
        open={false}
        summary={{ activeCount: 2, issueCount: 1 }}
        onToggle={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Show status bar, 1 issues' })
    expect(button).toHaveAttribute('data-status', 'error')
    expect(button).toHaveTextContent('1')
  })

  it('reflects the shared status center summary without explicit props', () => {
    useStatusCenterSummaryStore.setState({ activeCount: 4, issueCount: 0 })
    const view = render(<AppStatusBarEdgeHandle open={false} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Show status bar, 4 active tasks' })).toHaveAttribute(
      'data-status',
      'active',
    )

    useStatusCenterSummaryStore.setState({ activeCount: 4, issueCount: 2 })
    view.rerender(<AppStatusBarEdgeHandle open={false} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Show status bar, 2 issues' })).toHaveAttribute(
      'data-status',
      'error',
    )
  })
})
