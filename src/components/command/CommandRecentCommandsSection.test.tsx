import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Command } from '@/components/ui/command'
import CommandRecentCommandsSection from '@/components/command/CommandRecentCommandsSection'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CommandRecentCommandsSection', () => {
  it('shows recent commands in most-recent-first order and runs the selected command', () => {
    const onAction = vi.fn()
    render(
      <Command>
        <CommandRecentCommandsSection
          commandLabels={{ 'settings.open': 'Open settings', 'view.source': 'Source mode' }}
          recentCommandIds={['settings.open', 'view.source']}
          onAction={onAction}
        />
      </Command>,
    )

    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Open settings', 'Source mode'])
    fireEvent.click(options[0])
    expect(onAction).toHaveBeenCalledWith('settings.open')
  })

  it('renders nothing when no command has been used yet', () => {
    const { container } = render(
      <Command>
        <CommandRecentCommandsSection commandLabels={{}} recentCommandIds={[]} onAction={vi.fn()} />
      </Command>,
    )
    expect(container.querySelector('[cmdk-group]')).toBeNull()
  })
})
