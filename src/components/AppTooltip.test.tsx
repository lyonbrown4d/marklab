import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  content: vi.fn(({ children }) => children),
  provider: vi.fn(({ children }) => children),
  root: vi.fn(({ children }) => children),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: mocks.root,
  TooltipContent: mocks.content,
  TooltipProvider: mocks.provider,
  TooltipTrigger: 'button',
}))

import { Tooltip, TooltipContent, TooltipProvider } from '@/components/AppTooltip'

describe('AppTooltip', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('restores intentional hover delays while allowing explicit overrides', () => {
    render(
      <TooltipProvider>
        <span>Default</span>
      </TooltipProvider>,
    )
    expect(mocks.provider).toHaveBeenLastCalledWith(
      expect.objectContaining({ delayDuration: 180, skipDelayDuration: 120 }),
      undefined,
    )

    render(
      <TooltipProvider delayDuration={300} skipDelayDuration={40}>
        <span>Custom</span>
      </TooltipProvider>,
    )
    expect(mocks.provider).toHaveBeenLastCalledWith(
      expect.objectContaining({ delayDuration: 300, skipDelayDuration: 40 }),
      undefined,
    )
  })

  it('closes an uncontrolled tooltip when the window loses focus', () => {
    render(
      <Tooltip defaultOpen>
        <span>Content</span>
      </Tooltip>,
    )
    expect(mocks.root).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }), undefined)

    act(() => window.dispatchEvent(new Event('blur')))

    expect(mocks.root).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }), undefined)
  })

  it.each(['blur', 'pagehide'])('requests a controlled tooltip close on %s', (eventName) => {
    const onOpenChange = vi.fn()
    render(
      <Tooltip onOpenChange={onOpenChange} open>
        <span>Content</span>
      </Tooltip>,
    )

    act(() => window.dispatchEvent(new Event(eventName)))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.root).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }), undefined)
  })

  it('closes only when the document becomes hidden', () => {
    const onOpenChange = vi.fn()
    render(
      <Tooltip onOpenChange={onOpenChange} open>
        <span>Content</span>
      </Tooltip>,
    )
    const visibility = vi.spyOn(document, 'visibilityState', 'get')

    visibility.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(onOpenChange).not.toHaveBeenCalled()

    visibility.mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('uses collision-safe spacing and reduced-motion styling by default', () => {
    render(<TooltipContent>Details</TooltipContent>)

    expect(mocks.content).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collisionPadding: 8,
        sideOffset: 6,
        className: expect.stringContaining('motion-reduce:animate-none'),
      }),
      undefined,
    )
  })
})
