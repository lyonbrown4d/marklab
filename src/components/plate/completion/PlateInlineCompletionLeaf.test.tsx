import { render, screen } from '@testing-library/react'
import type { PlateLeafProps } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import { PlateInlineCompletionLeaf } from '@/components/plate/completion/PlateInlineCompletionLeaf'

const renderLeaf = (leafOverrides: Record<string, unknown> = {}) =>
  render(
    <PlateInlineCompletionLeaf
      {...({
        attributes: { 'data-testid': 'leaf' },
        children: 'Typed text',
        leaf: {
          text: '',
          ...leafOverrides,
        },
        text: { text: '' },
      } as unknown as PlateLeafProps)}
    />,
  )

describe('PlateInlineCompletionLeaf', () => {
  it('renders ghost text as inert escaped content', () => {
    renderLeaf({
      plateInlineCompletion: '<img src=x onerror=alert(1)>',
      plateInlineCompletionKind: 'ai',
    })

    const ghost = screen.getByText('<img src=x onerror=alert(1)>')
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost).toHaveAttribute('contenteditable', 'false')
    expect(ghost).toHaveAttribute('data-completion-kind', 'ai')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does not render an empty ghost node', () => {
    renderLeaf({ plateInlineCompletionKind: 'ai' })
    expect(screen.getByTestId('leaf')).toHaveTextContent('Typed text')
    expect(document.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })

  it('renders document candidates from an inert zero-width anchor without a ghost', () => {
    renderLeaf({
      plateInlineCompletionAccept: vi.fn(),
      plateInlineCompletionCandidates: [
        { source: 'document', text: ' write notes' },
        { source: 'document', text: ' review tasks' },
      ],
      plateInlineCompletionIndex: 1,
      plateInlineCompletionKind: 'document',
    })

    const options = screen.getAllByRole('option')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('write notes')
    expect(options[1]).toHaveTextContent('review tasks')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('review tasks')
    expect(screen.getByRole('listbox').parentElement).toHaveClass('rounded-xl', 'bg-popover/98')
    expect(document.querySelector('[data-completion-anchor]')).toHaveAttribute(
      'contenteditable',
      'false',
    )
    expect(document.querySelector('.marklab-ai-ghost-text')).toBeNull()
    expect(options[0]?.querySelector('[data-completion-meta]')).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
    )
    expect(document.querySelector('[data-completion-footer]')).toBeNull()
  })

  it('accepts a candidate with the mouse without moving the editor selection', () => {
    const accept = vi.fn()
    renderLeaf({
      plateInlineCompletionAccept: accept,
      plateInlineCompletionCandidates: [
        { source: 'document', text: ' write notes' },
        { source: 'document', text: ' review tasks' },
      ],
      plateInlineCompletionIndex: 1,
      plateInlineCompletionKind: 'document',
    })

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    screen.getAllByRole('option')[0]?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(accept).toHaveBeenCalledWith(0)
  })
})
