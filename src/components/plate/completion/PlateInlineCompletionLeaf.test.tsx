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
    const completion = ghost.parentElement
    expect(completion).toHaveAttribute('aria-hidden', 'true')
    expect(completion).toHaveAttribute('contenteditable', 'false')
    expect(completion).toHaveAttribute('data-completion-kind', 'ai')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(document.querySelector('[data-ai-completion-hint]')).toHaveTextContent('Tab')
    expect(document.querySelector('[data-ai-completion-source]')).toBeInTheDocument()
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

  it('renders workspace-link files and explicit create actions in the shared menu', () => {
    const accept = vi.fn()
    renderLeaf({
      plateWorkspaceLinkAccept: accept,
      plateWorkspaceLinkIndex: 1,
      plateWorkspaceLinkItems: [
        {
          detail: 'notes/Target.md',
          insertText: 'Target',
          kind: 'file',
          label: 'Target',
          replacementLength: 3,
        },
        {
          detail: 'Missing.md',
          insertText: '',
          kind: 'create-file',
          label: 'Create missing Markdown file "Missing.md"',
          replacementLength: 0,
        },
      ],
    })

    const listbox = screen.getByRole('listbox', { name: 'Workspace link suggestions' })
    const options = screen.getAllByRole('option')
    expect(listbox).toBeInTheDocument()
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('Targetnotes/Target.md')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    options[1]?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(accept).toHaveBeenCalledWith(1)
  })

  it.each(['document', 'workspace-link'])(
    'does not accept a %s option with a secondary mouse button',
    (kind) => {
      const accept = vi.fn()
      renderLeaf(
        kind === 'document'
          ? {
              plateInlineCompletionAccept: accept,
              plateInlineCompletionCandidates: [{ source: 'document', text: ' write notes' }],
              plateInlineCompletionKind: 'document',
            }
          : {
              plateWorkspaceLinkAccept: accept,
              plateWorkspaceLinkItems: [
                { kind: 'file', label: 'Target', insertText: 'Target', replacementLength: 0 },
              ],
            },
      )

      for (const button of [1, 2]) {
        const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button })
        screen.getByRole('option').dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
      expect(accept).not.toHaveBeenCalled()
    },
  )
})
