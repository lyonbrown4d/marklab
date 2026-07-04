import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarkdownDividerView from '@/components/markdown/MarkdownDividerView'

describe('MarkdownDividerView', () => {
  it('uses the shared separator while preserving selected state', () => {
    const { container } = render(<MarkdownDividerView selected />)

    const divider = container.querySelector('.marklab-md-block')
    const separator = divider?.querySelector('[data-orientation="horizontal"]')

    expect(divider).toHaveAttribute('data-selected', 'true')
    expect(separator).toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })
})
