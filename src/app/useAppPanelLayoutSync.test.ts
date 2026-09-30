import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppPanelLayoutSync } from '@/app/useAppPanelLayoutSync'

type Options = Parameters<typeof useAppPanelLayoutSync>[0]

const createOptions = (terminalOpen = false) => {
  const panel = {
    collapse: vi.fn(),
    expand: vi.fn(),
    getSize: vi.fn(() => ({ inPixels: 80, asPercentage: 10 })),
    isCollapsed: vi.fn(() => true),
    resize: vi.fn(),
  }
  const shell = document.createElement('div')
  const options = {
    shellGroupElementRef: { current: shell },
    terminalOpen,
    terminalPanelRef: { current: panel },
  } as unknown as Options
  return { options, panel, shell }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('terminal panel layout synchronization', () => {
  it('collapses a terminal that starts closed', () => {
    const { options, panel } = createOptions()

    renderHook(() => useAppPanelLayoutSync(options))

    expect(panel.collapse).toHaveBeenCalledOnce()
    expect(panel.expand).not.toHaveBeenCalled()
  })

  it('expands and restores a terminal that opens below its minimum usable height', () => {
    vi.useFakeTimers()
    const { options, panel, shell } = createOptions()
    const { rerender } = renderHook(() => useAppPanelLayoutSync(options))

    options.terminalOpen = true
    rerender()

    expect(panel.expand).toHaveBeenCalledOnce()
    expect(panel.resize).toHaveBeenCalledWith('280px')
    expect(shell).toHaveClass('is-panel-layout-animating')
    act(() => vi.runAllTimers())
    expect(shell).not.toHaveClass('is-panel-layout-animating')
  })

  it('collapses an open terminal when it closes', () => {
    const { options, panel } = createOptions(true)
    const { rerender } = renderHook(() => useAppPanelLayoutSync(options))
    panel.collapse.mockClear()

    options.terminalOpen = false
    rerender()

    expect(panel.collapse).toHaveBeenCalledOnce()
  })

  it('does nothing until the terminal panel is registered', () => {
    const { options, panel } = createOptions(true)
    options.terminalPanelRef.current = null

    renderHook(() => useAppPanelLayoutSync(options))

    expect(panel.expand).not.toHaveBeenCalled()
    expect(panel.resize).not.toHaveBeenCalled()
  })
})
