import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppStatusBarDock } from '@/components/AppStatusBarDock'

describe('AppStatusBarDock', () => {
  it('keeps the expanded status content interactive during the enter transition', () => {
    render(
      <AppStatusBarDock open>
        <button type="button">Status action</button>
      </AppStatusBarDock>,
    )

    const dock = screen.getByTestId('app-status-bar-dock')
    expect(dock).toHaveAttribute('data-state', 'open')
    expect(dock).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Status action' })).toBeVisible()
  })

  it('makes collapsed status content inert while retaining it for the exit transition', () => {
    render(
      <AppStatusBarDock open={false}>
        <button type="button">Status action</button>
      </AppStatusBarDock>,
    )

    const dock = screen.getByTestId('app-status-bar-dock')
    expect(dock).toHaveAttribute('data-state', 'closed')
    expect(dock).toHaveAttribute('inert')
    expect(dock).toHaveClass('motion-reduce:transition-none')
  })
})
