import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeMarkdownText } from '@/services/markdownTextAnalysisWorkerClient'
import { createComlinkTestWorker } from '@/test/comlinkTestWorker'
import { markdownTextAnalysisWorkerApi } from '@/workers/markdownTextAnalysisWorkerApi'

const { createWorker } = vi.hoisted(() => ({ createWorker: vi.fn() }))
vi.mock('@/workers/markdownTextAnalysisWorker?worker', () => ({
  default: class {
    constructor() {
      return createWorker()
    }
  },
}))

describe('Markdown text analysis request boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    createWorker.mockReset()
    vi.stubGlobal('Worker', class {})
  })
  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses stats RPC without collecting an outline and preserves the full analysis default', async () => {
    const { worker } = createComlinkTestWorker({
      ...markdownTextAnalysisWorkerApi,
      analyze: () => {
        throw new Error('Outline parsing should not run for stats')
      },
    })
    createWorker.mockReturnValueOnce(worker)
    await expect(analyzeMarkdownText('# Heading', { includeOutline: false })).resolves.toEqual({
      outline: [],
      stats: { characters: 8, lines: 1, words: 2 },
    })
    await vi.advanceTimersByTimeAsync(30_000)
    const next = createComlinkTestWorker(markdownTextAnalysisWorkerApi)
    createWorker.mockReturnValueOnce(next.worker)
    await expect(analyzeMarkdownText('# Heading')).resolves.toEqual(
      markdownTextAnalysisWorkerApi.analyze('# Heading'),
    )
  })

  it('does not fall back to UI-thread analysis when CPU work is cancelled', async () => {
    const { worker, listeners } = createComlinkTestWorker({ stats: () => new Promise(() => {}) })
    createWorker.mockReturnValueOnce(worker)
    const controller = new AbortController()
    const pending = analyzeMarkdownText('# Cancelled', {
      includeOutline: false,
      signal: controller.signal,
    })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const peerRejected = expect(
      analyzeMarkdownText('# Peer', { includeOutline: false }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await Promise.all([rejected, peerRejected])
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
  })

  it('keeps the fallback for unavailable workers and rejects already cancelled calls', async () => {
    createWorker.mockImplementationOnce(() => {
      throw new Error('Worker unavailable')
    })
    await expect(analyzeMarkdownText('one\r\ntwo', { includeOutline: false })).resolves.toEqual({
      outline: [],
      stats: { characters: 6, lines: 2, words: 2 },
    })
    vi.stubGlobal('Worker', undefined)
    await expect(analyzeMarkdownText('# Fallback')).resolves.toEqual(
      markdownTextAnalysisWorkerApi.analyze('# Fallback'),
    )
    const controller = new AbortController()
    controller.abort()
    await expect(analyzeMarkdownText('skip', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
