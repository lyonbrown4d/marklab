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
          bold: 'Bold',
          clear: 'Clear',
          code: 'Code',
          italic: 'Italic',
          link: 'Link',
          strike: 'Strike',
          toolbar: 'Formatting',
        }}
        open
        runAction={runAction}
        setToolbarElement={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('unchanged-toggle-value'))

    expect(runAction).not.toHaveBeenCalled()
  })
})
