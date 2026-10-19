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
  it('renders AI text as an escaped candidate with its source, without an inline ghost', () => {
    renderLeaf({
      plateInlineCompletion: '<img src=x onerror=alert(1)>',
      plateInlineCompletionKind: 'ai',
    })
    expect(screen.getByRole('option')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('[data-completion-ghost]')).toBeNull()
    expect(screen.getByRole('option').querySelector('[data-completion-meta]')).toHaveTextContent(
      'AI',
    )
    expect(screen.getByRole('status')).toHaveTextContent('<img src=x onerror=alert(1)>')
  })

  it('does not render an empty ghost node', () => {
    renderLeaf({ plateInlineCompletionKind: 'ai' })
    expect(screen.getByTestId('leaf')).toHaveTextContent('Typed text')
    expect(document.querySelector('[data-completion-ghost]')).toBeNull()
  })

  it('renders a single document candidate in the menu and accepts only a primary click', () => {
    const accept = vi.fn()
    renderLeaf({
      plateInlineCompletionAccept: accept,
      plateInlineCompletionCandidates: [{ source: 'document', text: ' write notes' }],
      plateInlineCompletionKind: 'document',
    })
    const option = screen.getByRole('option')
    expect(option).toHaveTextContent('write notes')
    expect(option.querySelector('[data-completion-meta]')).toHaveTextContent('Document')
    expect(document.querySelector('[data-completion-ghost]')).toBeNull()
    expect(accept).not.toHaveBeenCalled()
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    option.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(accept).toHaveBeenCalledWith(0)
  })

  it('renders multiple document candidates in a compact list', () => {
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
    expect(document.querySelector('[data-completion-ghost]')).toBeNull()
    expect(options[0]?.querySelector('[data-completion-meta]')).toHaveTextContent('Document')
    expect(options[0]?.querySelector('[data-completion-meta]')).not.toHaveClass('opacity-0')
    expect(document.querySelector('[data-completion-footer]')).toHaveTextContent(
      '↑↓ Select · Tab Accept · Esc Dismiss',
    )
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

  it('accepts an AI candidate from the menu without writing anything while it appears', () => {
    const accept = vi.fn()
    renderLeaf({
      plateInlineCompletion: ' tomorrow',
      plateInlineCompletionKind: 'ai',
      plateInlineCompletionAccept: accept,
    })
    expect(accept).not.toHaveBeenCalled()
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    screen.getByRole('option').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(accept).toHaveBeenCalledWith(0)
  })

  it.each(['document', 'workspace-link'])(
    'does not accept a %s option with a secondary mouse button',
    (kind) => {
      const accept = vi.fn()
      renderLeaf(
        kind === 'document'
          ? {
              plateInlineCompletionAccept: accept,
              plateInlineCompletionCandidates: [
                { source: 'document', text: ' write notes' },
                { source: 'document', text: ' review tasks' },
              ],
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
        screen.getAllByRole('option')[0]?.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
      expect(accept).not.toHaveBeenCalled()
    },
  )
})
