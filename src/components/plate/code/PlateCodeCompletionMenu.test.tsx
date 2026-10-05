import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlateCodeCompletionMenu } from '@/components/plate/code/PlateCodeCompletionMenu'

describe('PlateCodeCompletionMenu', () => {
  it('uses the shared menu surface and keeps metadata progressive', () => {
    render(
      <PlateCodeCompletionMenu
        activeIndex={0}
        items={[{ label: 'flowchart', detail: 'Mermaid diagram', documentation: 'Docs' }]}
        label="Code suggestions"
        menuId="code-suggestions"
        onActiveIndexChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    const listbox = screen.getByRole('listbox', { name: 'Code suggestions' })
    const option = screen.getByRole('option', { name: /flowchart/i })
    expect(listbox).toHaveClass('rounded-xl', 'bg-popover/98')
    expect(option).toHaveClass('group', 'min-h-8')
    expect(screen.getByText('Mermaid diagram')).toHaveClass('opacity-0', 'group-hover:opacity-100')
  })
})
