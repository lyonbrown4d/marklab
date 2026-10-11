import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/toggle-group', () => ({
  ToggleGroup: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode
    onValueChange: (value: string[]) => void
    value: string[]
  }) => (
    <div>
      <button
        data-testid="unchanged-toggle-value"
        onClick={() => onValueChange(value)}
        type="button"
      >
        unchanged
      </button>
      {children}
    </div>
  ),
  ToggleGroupItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

import { PlateSelectionToolbar } from '@/components/plate/selection/PlateSelectionToolbar'

describe('PlateSelectionToolbar value synchronization', () => {
  it('does not dispatch when the primitive reports an unchanged value set', () => {
    const runAction = vi.fn(() => true)
    render(
      <PlateSelectionToolbar
        activeMarks={{ bold: true, code: false, italic: false, link: false, strike: false }}
        anchor={{ left: 0, top: 0 }}
        labels={{
          ai: 'Ask AI',
          blockStyle: 'Block style',
          bold: 'Bold',
          bulletList: 'Bullet list',
          clear: 'Clear',
          code: 'Code',
          copyError: 'Could not copy Markdown',
          copyMarkdown: 'Copy as Markdown',
          heading1: 'Heading 1',
          heading2: 'Heading 2',
          heading3: 'Heading 3',
          italic: 'Italic',
          link: 'Link',
          more: 'More actions',
          orderedList: 'Ordered list',
          paragraph: 'Paragraph',
          quote: 'Quote',
          strike: 'Strike',
          toolbar: 'Formatting',
        }}
        open
        runAction={runAction}
        runMoreAction={vi.fn(() => true)}
        setToolbarElement={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('unchanged-toggle-value'))

    expect(runAction).not.toHaveBeenCalled()
  })
})
