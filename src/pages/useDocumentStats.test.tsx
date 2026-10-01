import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDocumentStats } from '@/pages/useDocumentStats'

describe('useDocumentStats', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('updates when Electron never runs its idle callback', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 23),
    )
    vi.stubGlobal('cancelIdleCallback', vi.fn())

    const { result } = renderHook(() => useDocumentStats('one two\nthree'))
    expect(result.current).toEqual({ characters: 0, lines: 0, words: 0 })

    act(() => vi.advanceTimersByTime(700))

    expect(result.current).toEqual({ characters: 11, lines: 2, words: 3 })
  })
})
