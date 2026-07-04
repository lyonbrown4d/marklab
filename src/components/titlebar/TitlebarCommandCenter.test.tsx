import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TitlebarCommandCenter } from '@/components/titlebar/TitlebarCommandCenter'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'sidebar.search': 'Search',
        'tabs.error': 'Error',
        'tabs.unsaved': 'Unsaved',
      }
      return labels[key] ?? key
    },
  }),
}))

describe('TitlebarCommandCenter', () => {
  it('uses a decorative shared separator between the active tab and search hint', () => {
    render(
      <TitlebarCommandCenter
        activePath="/notes/daily.md"
        activeTab={{ path: '/notes/daily.md' }}
        dirtyPaths={{}}
        saveStates={{}}
        silentSave={false}
        commandPaletteShortcut="Meta+K"
        onOpenSearch={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Search - daily.md' })
    const separator = button.querySelector('[data-orientation="vertical"]')

    expect(separator).toBeInTheDocument()
    expect(within(button).queryByRole('separator')).not.toBeInTheDocument()
  })
})
