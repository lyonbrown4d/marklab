import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppStatusBarEdgeHandle } from '@/components/AppStatusBarEdgeHandle'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'statusBar.hide': 'Hide status bar',
        'statusBar.show': 'Show status bar',
      })[key] ?? key,
  }),
}))

describe('AppStatusBarEdgeHandle', () => {
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
})
