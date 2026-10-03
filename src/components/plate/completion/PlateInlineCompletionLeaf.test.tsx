import { render, screen } from '@testing-library/react'
import type { PlateLeafProps } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { PlateInlineCompletionLeaf } from '@/components/plate/completion/PlateInlineCompletionLeaf'

const renderLeaf = (completion?: string) =>
  render(
    <PlateInlineCompletionLeaf
      {...({
        attributes: { 'data-testid': 'leaf' },
        children: 'Typed text',
        leaf: {
          plateInlineCompletion: completion,
          plateInlineCompletionSource: 'ai',
          text: '',
        },
        text: { text: '' },
      } as unknown as PlateLeafProps)}
    />,
  )

describe('PlateInlineCompletionLeaf', () => {
  it('renders ghost text as inert escaped content', () => {
    renderLeaf('<img src=x onerror=alert(1)>')

    const ghost = screen.getByText('<img src=x onerror=alert(1)>')
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost).toHaveAttribute('contenteditable', 'false')
    expect(ghost).toHaveAttribute('data-source', 'ai')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('does not render an empty ghost node', () => {
    renderLeaf()
    expect(screen.getByTestId('leaf')).toHaveTextContent('Typed text')
    expect(document.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })
})
