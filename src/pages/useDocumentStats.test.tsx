import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDocumentStats } from '@/pages/useDocumentStats'

const { analyzeDocumentStatsInWorker } = vi.hoisted(() => ({
  analyzeDocumentStatsInWorker: vi.fn(),
}))

vi.mock('@/services/markdownTextAnalysisWorkerClient', () => ({
  analyzeDocumentStatsInWorker,
}))

describe('useDocumentStats', () => {
  afterEach(() => {
    analyzeDocumentStatsInWorker.mockReset()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('updates from the markdown analysis worker', async () => {
    vi.useFakeTimers()
    analyzeDocumentStatsInWorker.mockResolvedValue({ characters: 11, lines: 2, words: 3 })
    const { result } = renderHook(() => useDocumentStats('one two\nthree'))
    expect(result.current).toEqual({ characters: 0, lines: 0, words: 0 })
    expect(analyzeDocumentStatsInWorker).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(result.current).toEqual({ characters: 11, lines: 2, words: 3 })
    expect(analyzeDocumentStatsInWorker).toHaveBeenCalledWith(
      'one two\nthree',
      expect.any(AbortSignal),
    )
  })

  it('discards a stale worker result after the document changes', async () => {
    vi.useFakeTimers()
    let resolveOld: ((value: { characters: number; lines: number; words: number }) => void) | null =
      null
    analyzeDocumentStatsInWorker
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce({ characters: 2, lines: 1, words: 1 })

    const { result, rerender } = renderHook(({ value }) => useDocumentStats(value), {
      initialProps: { value: 'old document' },
    })
    await act(() => vi.advanceTimersByTimeAsync(250))
    rerender({ value: 'ok' })
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(result.current).toEqual({ characters: 2, lines: 1, words: 1 })

    act(() => resolveOld?.({ characters: 99, lines: 99, words: 99 }))
    await act(async () => Promise.resolve())
    expect(result.current).toEqual({ characters: 2, lines: 1, words: 1 })
  })

  it('debounces rapid input and only clones the latest value into the worker', async () => {
    vi.useFakeTimers()
    analyzeDocumentStatsInWorker.mockResolvedValue({ characters: 3, lines: 1, words: 1 })
    const { rerender } = renderHook(({ value }) => useDocumentStats(value), {
      initialProps: { value: 'a' },
    })

    await act(() => vi.advanceTimersByTimeAsync(100))
    rerender({ value: 'ab' })
    await act(() => vi.advanceTimersByTimeAsync(100))
    rerender({ value: 'abc' })
    await act(() => vi.advanceTimersByTimeAsync(249))
    expect(analyzeDocumentStatsInWorker).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))

    expect(analyzeDocumentStatsInWorker).toHaveBeenCalledTimes(1)
    expect(analyzeDocumentStatsInWorker).toHaveBeenCalledWith('abc', expect.any(AbortSignal))
  })

  it('does not start analysis while disabled', () => {
    const { result } = renderHook(() => useDocumentStats('large text', false))
    expect(result.current).toEqual({ characters: 0, lines: 0, words: 0 })
    expect(analyzeDocumentStatsInWorker).not.toHaveBeenCalled()
  })
})
