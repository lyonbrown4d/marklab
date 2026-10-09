import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Command, CommandList } from '@/components/ui/command'
import CommandSettingsSection from '@/components/command/CommandSettingsSection'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CommandSettingsSection', () => {
  it('filters settings and opens the exact route target', () => {
    const onOpen = vi.fn()
    render(
      <Command>
        <CommandList>
          <CommandSettingsSection query="theme preset" onOpen={onOpen} />
        </CommandList>
      </Command>,
    )

    fireEvent.click(screen.getByRole('option', { name: /settings\.themePreset/ }))
    expect(onOpen).toHaveBeenCalledWith({ route: 'appearance', targetId: 'settings-theme' })
  })

  it('shows no section before a query is entered', () => {
    const { container } = render(
      <Command>
        <CommandList>
          <CommandSettingsSection query="" onOpen={vi.fn()} />
        </CommandList>
      </Command>,
    )
    expect(container.querySelector('[cmdk-group]')).toBeNull()
  })
})
