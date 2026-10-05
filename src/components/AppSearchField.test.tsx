import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import AppSearchField from '@/components/AppSearchField'

describe('AppSearchField', () => {
  it('uses the shared search geometry and forwards its input ref', () => {
    const ref = createRef<HTMLInputElement>()
    render(
      <AppSearchField
        ref={ref}
        aria-label="Search files"
        clearLabel="Clear search"
        value=""
        onChange={vi.fn()}
      />,
    )

    const input = screen.getByRole('searchbox', { name: 'Search files' })
    expect(ref.current).toBe(input)
    expect(input).toHaveClass('rounded-lg', 'pl-8', 'focus-visible:ring-2')
    expect(input.parentElement).toHaveAttribute('data-slot', 'app-search-field')
  })

  it('reveals a keyboard-accessible clear action only when there is a value', () => {
    const onClear = vi.fn()
    const { rerender } = render(
      <AppSearchField
        aria-label="Search files"
        clearLabel="Clear search"
        value="notes"
        onChange={vi.fn()}
        onClear={onClear}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClear).toHaveBeenCalledOnce()

    rerender(
      <AppSearchField
        aria-label="Search files"
        clearLabel="Clear search"
        value=""
        onChange={vi.fn()}
        onClear={onClear}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })
})
