import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandEmptyState from '@/components/command/CommandEmptyState'

const suggestions = [
  { marker: '@', label: 'files', value: '@ ' },
  { marker: '#', label: 'headings', value: '# ' },
  { marker: '?', label: 'text', value: '? ' },
]

describe('CommandEmptyState', () => {
  it('uses the shared empty-state semantics and exposes scope suggestions', () => {
    const onSelectScope = vi.fn()
    const { container } = render(
      <CommandEmptyState
        title="No command results"
        description="Type to search files, headings, and text."
        suggestions={suggestions}
        onSelectScope={onSelectScope}
      />,
    )

    expect(screen.getByRole('heading', { name: 'No command results' })).toHaveAttribute(
      'aria-level',
      '2',
    )
    expect(screen.getByText('Type to search files, headings, and text.')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="empty"]')).toHaveClass('bg-transparent')

    fireEvent.click(screen.getByRole('button', { name: '@ files' }))

    expect(onSelectScope).toHaveBeenCalledWith('@ ')
  })
})
