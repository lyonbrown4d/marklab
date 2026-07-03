import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import CommandRecentFilesSection from '@/components/command/CommandRecentFilesSection'

const messages: Record<string, string> = {
  'command.recent': 'Recent',
  'command.recentFiles': 'Recent files',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/components/ui/command', () => ({
  CommandGroup: ({ children, heading }: { children: ReactNode; heading: string }) => (
    <section aria-label={heading}>{children}</section>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
    value?: string
  }) => (
    <button onClick={() => onSelect?.()} type="button">
      {children}
    </button>
  ),
  CommandShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

const files = [
  { label: 'Alpha.md', path: 'docs/Alpha.md' },
  { label: 'Beta.md', path: 'docs/Beta.md' },
  { label: 'Gamma.md', path: 'notes/Gamma.md' },
  { label: 'Delta.md', path: 'notes/Delta.md' },
  { label: 'Epsilon.md', path: 'archive/Epsilon.md' },
  { label: 'Zeta.md', path: 'archive/Zeta.md' },
]

describe('CommandRecentFilesSection', () => {
  it('renders the five most recent localized file commands', () => {
    render(<CommandRecentFilesSection files={files} query="" onOpenFile={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'Recent files' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.getAllByText('Recent')).toHaveLength(5)
    expect(screen.getByText('Alpha.md')).toBeTruthy()
    expect(screen.queryByText('Zeta.md')).toBeNull()
  })

  it('filters recent files by label or path and opens the selected file', () => {
    const onOpenFile = vi.fn()

    render(<CommandRecentFilesSection files={files} query="notes" onOpenFile={onOpenFile} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('Gamma.md')).toBeTruthy()
    expect(screen.getByText('Delta.md')).toBeTruthy()

    const gammaButton = screen.getByText('Gamma.md').closest('button')
    expect(gammaButton).not.toBeNull()

    fireEvent.click(gammaButton as HTMLButtonElement)

    expect(onOpenFile).toHaveBeenCalledWith('notes/Gamma.md')
  })
})
