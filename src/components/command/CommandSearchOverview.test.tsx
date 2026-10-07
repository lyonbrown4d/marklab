import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandSearchOverview from '@/components/command/CommandSearchOverview'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CommandSearchOverview', () => {
  it('presents quick open, full text, and commands as distinct modes', () => {
    const onSelectMode = vi.fn()
    render(<CommandSearchOverview mode="full-text" onSelectMode={onSelectMode} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'command.mode.quickOpen' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('tab', { name: 'command.mode.fullText' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.commands' }))
    expect(onSelectMode).toHaveBeenCalledWith('commands')
  })
})
