import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlateEditorSurface } from '@/components/plate/PlateEditorSurface'

// Match the beforeinput capability available in current desktop WebViews.
vi.hoisted(() => {
  Object.defineProperty(InputEvent.prototype, 'getTargetRanges', {
    configurable: true,
    value: () => [],
  })
})

describe('Plate native writing policy', () => {
  it('disables native predictions and correction on the actual editable host', () => {
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="Paragraph"
      />,
    )
    const host = screen.getByTestId('markdown-editor')
    expect(host).toHaveAttribute('writingsuggestions', 'false')
    expect(host).toHaveAttribute('autocorrect', 'off')
    expect(host).toHaveAttribute('autocapitalize', 'off')
    expect(host).toHaveAttribute('spellcheck', 'true')
  })
})
