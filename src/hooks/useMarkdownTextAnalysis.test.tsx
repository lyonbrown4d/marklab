import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkdownTextAnalysis } from '@/hooks/useMarkdownTextAnalysis'
import type { MarkdownTextAnalysisResult } from '@/logic/markdownTextAnalysis'

const { analyze } = vi.hoisted(() => ({ analyze: vi.fn() }))
vi.mock('@/services/markdownTextAnalysisWorkerClient', () => ({ analyzeMarkdownText: analyze }))
const analyzed: MarkdownTextAnalysisResult = {
  outline: [],
  stats: { characters: 6, lines: 1, words: 1 },
}

describe('live sidebar text analysis', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    analyze.mockReset().mockResolvedValue(analyzed)
  })
  afterEach(() => vi.useRealTimers())

  it('coalesces typing and requests stats without reparsing the indexed outline', async () => {
    const { result, rerender } = renderHook(
      ({ content }) => useMarkdownTextAnalysis(content, true, 'file.md', false),
      { initialProps: { content: 'a' } },
    )
    expect(result.current.isLoading).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(100))
    rerender({ content: 'ab' })
    await act(() => vi.advanceTimersByTimeAsync(100))
    rerender({ content: 'latest' })
    await act(() => vi.advanceTimersByTimeAsync(249))
    expect(analyze).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(analyze).toHaveBeenCalledExactlyOnceWith('latest', {
      includeOutline: false,
      signal: expect.any(AbortSignal),
    })
    expect(result.current).toMatchObject({ ...analyzed, isLoading: false, error: null })
  })

  it('aborts stale work on file switch and ignores its result without losing the new outline', async () => {
    let finish: ((value: MarkdownTextAnalysisResult) => void) | undefined
    analyze.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { result, rerender } = renderHook(
      ({ path }) => useMarkdownTextAnalysis('same text', true, path),
      { initialProps: { path: 'first.md' } },
    )
    await act(() => vi.advanceTimersByTimeAsync(250))
    const { signal } = analyze.mock.calls[0][1] as { signal: AbortSignal }
    rerender({ path: 'second.md' })
    expect(signal.aborted).toBe(true)
    expect(result.current).toMatchObject({ isLoading: true, outline: [] })
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(analyze.mock.calls[1][1].includeOutline).toBe(true)
    await act(async () =>
      finish?.({ ...analyzed, stats: { characters: 999, lines: 999, words: 999 } }),
    )
    expect(result.current.stats).toEqual(analyzed.stats)
  })

  it('exposes errors and stops queued or running work when the sidebar closes', async () => {
    analyze.mockRejectedValueOnce(new Error('analysis unavailable'))
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useMarkdownTextAnalysis('latest', enabled, 'file.md'),
      { initialProps: { enabled: true } },
    )
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(result.current).toMatchObject({ error: 'analysis unavailable', isLoading: false })
    const { signal } = analyze.mock.calls[0][1] as { signal: AbortSignal }
    rerender({ enabled: false })
    expect(signal.aborted).toBe(true)
    expect(result.current).toMatchObject({ error: null, isLoading: false })
    rerender({ enabled: true })
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(analyze).toHaveBeenCalledTimes(1)
  })
})
