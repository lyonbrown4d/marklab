import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const provider = vi.hoisted(() => vi.fn(({ children }) => children))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: 'div',
  TooltipContent: 'div',
  TooltipProvider: provider,
  TooltipTrigger: 'button',
}))

import { TooltipProvider } from '@/components/AppTooltip'

describe('AppTooltip', () => {
  it('restores intentional hover delays while allowing explicit overrides', () => {
    render(
      <TooltipProvider>
        <span>Default</span>
      </TooltipProvider>,
    )
    expect(provider).toHaveBeenLastCalledWith(
      expect.objectContaining({ delayDuration: 180, skipDelayDuration: 120 }),
      undefined,
    )

    render(
      <TooltipProvider delayDuration={300} skipDelayDuration={40}>
        <span>Custom</span>
      </TooltipProvider>,
    )
    expect(provider).toHaveBeenLastCalledWith(
      expect.objectContaining({ delayDuration: 300, skipDelayDuration: 40 }),
      undefined,
    )
  })
})
