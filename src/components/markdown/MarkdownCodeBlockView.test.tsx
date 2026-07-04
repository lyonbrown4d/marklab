import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownCodeBlockView from '@/components/markdown/MarkdownCodeBlockView'

describe('MarkdownCodeBlockView', () => {
  it('renders editable code text for graph block surfaces', () => {
    const onCommit = vi.fn()

    render(
      <MarkdownCodeBlockView text="const value = 1" language="ts" editable onCommit={onCommit} />,
    )

    expect(screen.getByText('ts')).toBeInTheDocument()

    const code = screen.getByText('const value = 1')
    code.textContent = 'const value = 2'
    fireEvent.blur(code)

    expect(onCommit).toHaveBeenCalledWith('const value = 2')
  })

  it('renders a content ref target for Milkdown node views without owning the code text', () => {
    const contentRef = vi.fn()
    const { container } = render(<MarkdownCodeBlockView contentRef={contentRef} selected />)

    const block = container.querySelector('.marklab-md-block')
    const code = block?.querySelector('code')

    expect(block).toHaveAttribute('data-selected', 'true')
    expect(code?.textContent).toBe('')
    expect(contentRef).toHaveBeenCalledWith(code)
  })
})
