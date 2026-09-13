import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppPanelLayoutSync } from '@/app/useAppPanelLayoutSync'

const viewport = vi.hoisted(() => ({ compact: false }))
vi.mock('@/app/useInspectorOverlay', () => ({ useInspectorOverlay: () => viewport.compact }))

const frames = new Map<number, FrameRequestCallback>()
const flushFrame = () => {
  act(() => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(0))
  })
}

type Options = Parameters<typeof useAppPanelLayoutSync>[0]
const createOptions = () => {
  const panel = {
    collapse: vi.fn(),
    expand: vi.fn(),
    isCollapsed: vi.fn(() => true),
    getSize: vi.fn(() => ({ inPixels: 280, asPercentage: 30 })),
    resize: vi.fn(),
  }
  const options = {
    leftSidebarPanelRef: { current: null },
    rightSidebarPanelRef: { current: panel },
    terminalPanelRef: { current: null },
    workspaceGroupElementRef: { current: null },
    shellGroupElementRef: { current: null },
    sidebarCollapsed: false,
    rightSidebarCollapsed: false,
    terminalOpen: false,
  } as unknown as Options
  return { options, panel }
}

beforeEach(() => {
  viewport.compact = false
  frames.clear()
  let nextFrame = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++nextFrame
    frames.set(id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
})

afterEach(() => vi.restoreAllMocks())

describe('responsive inspector panel synchronization', () => {
  it('expands an open inspector as a panel in a wide window', () => {
    const { options, panel } = createOptions()
    renderHook(() => useAppPanelLayoutSync(options))
    expect(panel.expand).not.toHaveBeenCalled()
    flushFrame()
    expect(panel.expand).toHaveBeenCalledOnce()
    expect(panel.collapse).not.toHaveBeenCalled()
  })

  it('keeps the panel collapsed when a compact window uses the overlay', () => {
    viewport.compact = true
    const { options, panel } = createOptions()
    renderHook(() => useAppPanelLayoutSync(options))
    flushFrame()
    expect(panel.collapse).toHaveBeenCalledOnce()
    expect(panel.expand).not.toHaveBeenCalled()
  })

  it('restores the requested open panel after the window becomes wide', () => {
    viewport.compact = true
    const { options, panel } = createOptions()
    const { rerender } = renderHook(() => useAppPanelLayoutSync(options))
    flushFrame()
    viewport.compact = false
    rerender()
    flushFrame()
    expect(panel.expand).toHaveBeenCalledOnce()
  })

  it('does not reopen an inspector the user closed when resizing', () => {
    viewport.compact = true
    const { options, panel } = createOptions()
    options.rightSidebarCollapsed = true
    const { rerender } = renderHook(() => useAppPanelLayoutSync(options))
    flushFrame()
    viewport.compact = false
    rerender()
    flushFrame()
    expect(panel.expand).not.toHaveBeenCalled()
    expect(panel.collapse).toHaveBeenCalledTimes(2)
  })

  it('uses the panel registered before the next frame', () => {
    const { options, panel } = createOptions()
    options.rightSidebarPanelRef.current = null
    renderHook(() => useAppPanelLayoutSync(options))
    options.rightSidebarPanelRef.current = panel
    flushFrame()
    expect(panel.expand).toHaveBeenCalledOnce()
  })

  it('cancels a pending expansion when the user closes the inspector', () => {
    const { options, panel } = createOptions()
    const { rerender } = renderHook(() => useAppPanelLayoutSync(options))
    options.rightSidebarCollapsed = true
    rerender()
    flushFrame()
    expect(panel.expand).not.toHaveBeenCalled()
    expect(panel.collapse).toHaveBeenCalledOnce()
  })

  it('cancels a pending expansion when the window becomes compact', () => {
    const { options, panel } = createOptions()
    const { rerender } = renderHook(() => useAppPanelLayoutSync(options))
    viewport.compact = true
    rerender()
    flushFrame()
    expect(panel.expand).not.toHaveBeenCalled()
    expect(panel.collapse).toHaveBeenCalledOnce()
  })

  it('does not update a panel after unmounting', () => {
    const { options, panel } = createOptions()
    const { unmount } = renderHook(() => useAppPanelLayoutSync(options))
    unmount()
    flushFrame()
    expect(panel.expand).not.toHaveBeenCalled()
    expect(panel.collapse).not.toHaveBeenCalled()
  })
})
