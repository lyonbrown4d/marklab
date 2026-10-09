import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorSuggestionMenu } from '@/components/menu/EditorSuggestionMenu'

type Suggestion = {
  detail?: string
  group: 'structure' | 'insert'
  id: string
  label: string
}

const items: Suggestion[] = [
  { group: 'structure', id: 'heading', label: 'Heading' },
  { detail: 'Diagram', group: 'insert', id: 'mermaid', label: 'Mermaid' },
]

describe('EditorSuggestionMenu', () => {
  it('renders grouped options with a selected keyboard hint', () => {
    render(
      <EditorSuggestionMenu
        activeIndex={1}
        emptyLabel="No suggestions"
        getGroup={(item) => item.group}
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        groups={[
          { id: 'structure', label: 'Structure' },
          { id: 'insert', label: 'Insert' },
        ]}
        items={items}
        label="Suggestions"
        onActiveIndexChange={vi.fn()}
        onSelect={vi.fn()}
        renderMeta={(item) => item.detail}
        selectionHint="Enter"
      />,
    )

    expect(
      screen.getByRole('listbox', { name: 'Suggestions' }).closest('[data-editor-suggestion-menu]'),
    ).toBeInTheDocument()
    expect(screen.getByText('Structure')).toBeInTheDocument()
    expect(screen.getByText('Insert')).toBeInTheDocument()
    const selected = screen.getByRole('option', { name: 'Mermaid' })
    expect(selected).toHaveAttribute('aria-selected', 'true')
    expect(within(selected).getByText('Enter')).toHaveClass('group-data-[active=true]:opacity-100')
    expect(screen.getByText('Diagram')).toHaveClass('group-hover:opacity-100')
  })

  it('updates pointer selection and preserves editor focus on selection', () => {
    const onActiveIndexChange = vi.fn()
    const onSelect = vi.fn()
    render(
      <EditorSuggestionMenu
        activeIndex={0}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={items}
        label="Suggestions"
        onActiveIndexChange={onActiveIndexChange}
        onSelect={onSelect}
      />,
    )
    const option = screen.getByRole('option', { name: 'Mermaid' })
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })

    option.dispatchEvent(mouseDown)
    fireEvent.pointerMove(option)
    fireEvent.click(option)

    expect(mouseDown.defaultPrevented).toBe(true)
    expect(onActiveIndexChange).toHaveBeenCalledWith(1)
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })

  it('renders an explicit empty state', () => {
    render(
      <EditorSuggestionMenu
        activeIndex={0}
        emptyLabel="No suggestions"
        getId={(item: Suggestion) => item.id}
        getLabel={(item) => item.label}
        items={[]}
        label="Suggestions"
        onActiveIndexChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('No suggestions')).toBeInTheDocument()
  })

  it('uses stable labelled and described option ids without overriding the accessible name', () => {
    const { rerender } = render(
      <EditorSuggestionMenu
        activeIndex={1}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={items}
        label="Suggestions"
        menuId="editor-suggestions"
        onActiveIndexChange={vi.fn()}
        onSelect={vi.fn()}
        renderScreenReaderDescription={(item) => item.detail}
      />,
    )
    const option = screen.getByRole('option', { name: 'Mermaid' })
    const optionId = option.id
    const descriptionId = option.getAttribute('aria-describedby')

    expect(optionId).toBe('editor-suggestions-option-mermaid-0')
    expect(option).not.toHaveAttribute('aria-label')
    expect(descriptionId).toBe(`${optionId}-description`)
    expect(document.getElementById(descriptionId ?? '')).toHaveTextContent('Diagram')

    rerender(
      <EditorSuggestionMenu
        activeIndex={1}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={items}
        label="Suggestions"
        menuId="editor-suggestions"
        onActiveIndexChange={vi.fn()}
        onSelect={vi.fn()}
        renderScreenReaderDescription={(item) => item.detail}
      />,
    )
    expect(screen.getByRole('option', { name: 'Mermaid' })).toHaveAttribute('id', optionId)
  })

  it('keeps duplicate candidates distinct and reports their real index after replacement', () => {
    const duplicate = { group: 'insert', id: 'duplicate', label: 'Duplicate' } as const
    const onActiveIndexChange = vi.fn()
    const { rerender } = render(
      <EditorSuggestionMenu
        activeIndex={0}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={[duplicate, duplicate]}
        label="Suggestions"
        menuId="duplicate-menu"
        onActiveIndexChange={onActiveIndexChange}
        onSelect={vi.fn()}
      />,
    )
    const duplicateOptions = screen.getAllByRole('option', { name: 'Duplicate' })

    expect(duplicateOptions.map(({ id }) => id)).toEqual([
      'duplicate-menu-option-duplicate-0',
      'duplicate-menu-option-duplicate-1',
    ])
    fireEvent.pointerMove(duplicateOptions[1])
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(1)

    const replacement = [
      { group: 'insert', id: 'alpha', label: 'Alpha' },
      { group: 'structure', id: 'beta', label: 'Beta' },
    ] satisfies Suggestion[]
    rerender(
      <EditorSuggestionMenu
        activeIndex={0}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={replacement}
        label="Suggestions"
        menuId="duplicate-menu"
        onActiveIndexChange={onActiveIndexChange}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute(
      'id',
      'duplicate-menu-option-alpha-0',
    )
    expect(screen.queryByRole('option', { name: 'Duplicate' })).not.toBeInTheDocument()
  })

  it('keeps business option ids stable when unrelated candidates are inserted or reordered', () => {
    const onActiveIndexChange = vi.fn()
    const { rerender } = render(
      <EditorSuggestionMenu
        activeIndex={0}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={items}
        label="Suggestions"
        menuId="reordered-menu"
        onActiveIndexChange={onActiveIndexChange}
        onSelect={vi.fn()}
      />,
    )
    const mermaidId = screen.getByRole('option', { name: 'Mermaid' }).id
    const headingId = screen.getByRole('option', { name: 'Heading' }).id

    rerender(
      <EditorSuggestionMenu
        activeIndex={0}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={[{ group: 'insert', id: 'table', label: 'Table' }, items[1]!, items[0]!]}
        label="Suggestions"
        menuId="reordered-menu"
        onActiveIndexChange={onActiveIndexChange}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Mermaid' })).toHaveAttribute('id', mermaidId)
    const heading = screen.getByRole('option', { name: 'Heading' })
    expect(heading).toHaveAttribute('id', headingId)
    fireEvent.pointerMove(heading)
    expect(onActiveIndexChange).toHaveBeenLastCalledWith(2)
  })

  it('does not duplicate candidates when an incomplete grouping contract reaches runtime', () => {
    const incompleteGrouping = {
      groups: [
        { id: 'structure', label: 'Structure' },
        { id: 'insert', label: 'Insert' },
      ],
    } as unknown as {
      getGroup: (item: Suggestion) => string
      groups: readonly { id: string; label: string }[]
    }
    render(
      <EditorSuggestionMenu
        activeIndex={0}
        emptyLabel="No suggestions"
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        items={items}
        label="Suggestions"
        onActiveIndexChange={vi.fn()}
        onSelect={vi.fn()}
        {...incompleteGrouping}
      />,
    )

    expect(screen.getAllByRole('option')).toHaveLength(items.length)
    expect(screen.queryByText('Structure')).not.toBeInTheDocument()
    expect(screen.queryByText('Insert')).not.toBeInTheDocument()
  })
})
