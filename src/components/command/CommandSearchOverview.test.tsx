import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandSearchOverview from '@/components/command/CommandSearchOverview'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CommandSearchOverview', () => {
  it('presents files, full text, commands, and settings as distinct modes', () => {
    const onSelectMode = vi.fn()
    render(<CommandSearchOverview mode="full-text" onSelectMode={onSelectMode} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
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
    fireEvent.click(screen.getByRole('tab', { name: 'command.mode.settings' }))
    expect(onSelectMode).toHaveBeenCalledWith('settings')
  })

  it('cycles scopes from the keyboard with Tab and Shift+Tab', () => {
    const onSelectMode = vi.fn()
    render(<CommandSearchOverview mode="quick-open" onSelectMode={onSelectMode} />)

    fireEvent.keyDown(screen.getByRole('tab', { name: 'command.mode.quickOpen' }), { key: 'Tab' })
    expect(onSelectMode).toHaveBeenLastCalledWith('full-text')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'command.mode.quickOpen' }), {
      key: 'Tab',
      shiftKey: true,
    })
    expect(onSelectMode).toHaveBeenLastCalledWith('settings')
  })
})
