import { render, screen } from '@testing-library/react'
import type { PlateLeafProps } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import { PlateInlineCompletionLeaf } from '@/components/plate/completion/PlateInlineCompletionLeaf'

const renderLeaf = (completion?: string, leafOverrides: Record<string, unknown> = {}) =>
  render(
    <PlateInlineCompletionLeaf
      {...({
        attributes: { 'data-testid': 'leaf' },
        children: 'Typed text',
        leaf: {
          plateInlineCompletion: completion,
          plateInlineCompletionSource: 'ai',
          text: '',
          ...leafOverrides,
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

  it('renders all completion candidates and marks the active option', () => {
    renderLeaf(' review tasks', {
      plateInlineCompletionAccept: vi.fn(),
      plateInlineCompletionCandidates: [
        { source: 'document', text: ' write notes' },
        { source: 'ai', text: ' review tasks' },
      ],
      plateInlineCompletionIndex: 1,
    })

    const options = screen.getAllByRole('option')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('write notes')
    expect(options[1]).toHaveTextContent('review tasks')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('review tasks')
    expect(screen.getByRole('listbox').parentElement).toHaveClass('rounded-xl', 'bg-popover/98')
    expect(options[0]?.querySelector('[data-completion-meta]')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
    )
    expect(document.querySelector('[data-completion-footer]')).toBeNull()
  })

  it('accepts a candidate with the mouse without moving the editor selection', () => {
    const accept = vi.fn()
    renderLeaf(' review tasks', {
      plateInlineCompletionAccept: accept,
      plateInlineCompletionCandidates: [
        { source: 'document', text: ' write notes' },
        { source: 'ai', text: ' review tasks' },
      ],
      plateInlineCompletionIndex: 1,
    })

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    screen.getAllByRole('option')[0]?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(accept).toHaveBeenCalledWith(0)
  })
})
