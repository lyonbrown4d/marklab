import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandRecentLocationsSection from '@/components/command/CommandRecentLocationsSection'
import { Command, CommandList } from '@/components/ui/command'

vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('CommandRecentLocationsSection', () => {
  it('renders typed file and edit locations and opens the selected location', () => {
    const onOpen = vi.fn()
    const locations = [
      { kind: 'heading' as const, path: 'guide.md', slug: 'setup' },
      { kind: 'source' as const, path: 'api.ts', line: 42, column: 5 },
      { kind: 'graph' as const, nodeId: 'guide.md' },
    ]
    render(
      <Command>
        <CommandList>
          <CommandRecentLocationsSection locations={locations} onOpen={onOpen} />
        </CommandList>
      </Command>,
    )

    expect(screen.getByText('guide.md · #setup')).toBeVisible()
    expect(screen.getByText('api.ts · 42:5')).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /api\.ts/ }))
    expect(onOpen).toHaveBeenCalledWith(locations[1])
  })

  it('renders nothing for an empty navigation history', () => {
    const { container } = render(
      <Command>
        <CommandList>
          <CommandRecentLocationsSection locations={[]} onOpen={vi.fn()} />
        </CommandList>
      </Command>,
    )
    expect(container.querySelector('[cmdk-group]')).toBeNull()
  })
})
