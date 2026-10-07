import { describe, expect, it, vi } from 'vitest'
import { MarkdownDocumentStatsScheduler } from '@/services/markdownDocumentStatsScheduler'
import type { MarkdownDocumentStats } from '@/logic/markdownTextAnalysis'

describe('MarkdownDocumentStatsScheduler', () => {
  it('cancels running and queued stale work so only the latest result completes', async () => {
    const started: string[] = []
    const run = vi.fn(
      (content: string, signal: AbortSignal) =>
        new Promise<MarkdownDocumentStats>((resolve, reject) => {
          started.push(content)
          const abort = () => reject(new DOMException('Aborted', 'AbortError'))
          signal.addEventListener('abort', abort, { once: true })
          if (content === 'latest') {
            resolve({ characters: 6, lines: 1, words: 1 })
          }
        }),
    )
    const scheduler = new MarkdownDocumentStatsScheduler(run)

    const first = scheduler.runLatest('old')
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(started).toEqual(['old']))
    const middle = scheduler.runLatest('middle')
    const middleRejection = expect(middle).rejects.toMatchObject({ name: 'AbortError' })
    const latest = scheduler.runLatest('latest')

    await firstRejection
    await middleRejection
    await expect(latest).resolves.toEqual({ characters: 6, lines: 1, words: 1 })
    expect(started).toEqual(['old', 'latest'])
  })

  it('does not start work when the caller is already cancelled', async () => {
    const run = vi.fn()
    const scheduler = new MarkdownDocumentStatsScheduler(run)
    const controller = new AbortController()
    controller.abort()

    await expect(scheduler.runLatest('ignored', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(run).not.toHaveBeenCalled()
  })
})
