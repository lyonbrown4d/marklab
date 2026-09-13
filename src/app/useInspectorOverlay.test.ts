import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInspectorOverlay } from '@/app/useInspectorOverlay'

afterEach(() => vi.unstubAllGlobals())

describe('inspector presentation breakpoint', () => {
  it.each([true, false])('reads the initial compact state: %s', (matches) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    const { result } = renderHook(useInspectorOverlay)
    expect(result.current).toBe(matches)
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 959px)')
  })

  it('responds to window resizing and releases its listener', () => {
    let matches = true
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return matches
      },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    }))
    const { result, unmount } = renderHook(useInspectorOverlay)
    act(() => {
      matches = false
      listeners.forEach((listener) => listener())
    })
    expect(result.current).toBe(false)
    unmount()
    expect(listeners.size).toBe(0)
  })
})
