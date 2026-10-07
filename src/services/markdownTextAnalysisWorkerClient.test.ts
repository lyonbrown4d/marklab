import { describe, expect, it, vi } from 'vitest'
import { MarkdownTextAnalysisWorkerClient } from '@/services/markdownTextAnalysisWorkerClient'

class FakeWorker {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly postMessage = vi.fn()
  readonly terminate = vi.fn()

  respond(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

describe('MarkdownTextAnalysisWorkerClient', () => {
  it('requests stats without computing or returning the outline', async () => {
    const worker = new FakeWorker()
    const client = new MarkdownTextAnalysisWorkerClient(() => worker)
    const result = client.stats('one two')

    expect(worker.postMessage).toHaveBeenCalledWith({
      content: 'one two',
      id: 1,
      task: 'stats',
    })
    worker.respond({
      id: 1,
      ok: true,
      payload: { characters: 6, lines: 1, words: 2 },
      task: 'stats',
    })

    await expect(result).resolves.toEqual({ characters: 6, lines: 1, words: 2 })
  })

  it('terminates CPU work and rejects its result when stats are cancelled', async () => {
    const firstWorker = new FakeWorker()
    const secondWorker = new FakeWorker()
    const createWorker = vi
      .fn<() => FakeWorker>()
      .mockReturnValueOnce(firstWorker)
      .mockReturnValueOnce(secondWorker)
    const client = new MarkdownTextAnalysisWorkerClient(createWorker)
    const controller = new AbortController()
    const stale = client.stats('old', controller.signal)

    controller.abort()

    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    expect(firstWorker.terminate).toHaveBeenCalledOnce()
    const latest = client.stats('new')
    secondWorker.respond({
      id: 2,
      ok: true,
      payload: { characters: 3, lines: 1, words: 1 },
      task: 'stats',
    })
    await expect(latest).resolves.toEqual({ characters: 3, lines: 1, words: 1 })
  })
})
