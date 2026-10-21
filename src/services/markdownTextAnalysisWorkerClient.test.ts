import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownTextAnalysisWorkerClient } from '@/services/markdownTextAnalysisWorkerClient'
import { createComlinkTestWorker } from '@/test/comlinkTestWorker'
import { markdownTextAnalysisWorkerApi } from '@/workers/markdownTextAnalysisWorkerApi'

const clients: MarkdownTextAnalysisWorkerClient[] = []
afterEach(() => clients.splice(0).forEach((client) => client.terminate()))

describe('MarkdownTextAnalysisWorkerClient', () => {
  it('returns stats and outline analysis over structured-clone RPC', async () => {
    const { worker } = createComlinkTestWorker(markdownTextAnalysisWorkerApi)
    const client = new MarkdownTextAnalysisWorkerClient(() => worker)
    clients.push(client)

    await expect(client.stats('one two')).resolves.toEqual({ characters: 6, lines: 1, words: 2 })
    await expect(client.analyze('# Heading')).resolves.toEqual(
      markdownTextAnalysisWorkerApi.analyze('# Heading'),
    )
  })

  it('terminates cancelled CPU work, rejects peers, and starts a fresh worker', async () => {
    const first = createComlinkTestWorker({ stats: () => new Promise(() => {}) })
    const second = createComlinkTestWorker(markdownTextAnalysisWorkerApi)
    const workers = [first.worker, second.worker]
    const client = new MarkdownTextAnalysisWorkerClient(() => workers.shift()!)
    clients.push(client)
    const controller = new AbortController()
    const stale = client.stats('old', controller.signal)
    const peer = client.stats('peer')
    const staleRejected = expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    const peerRejected = expect(peer).rejects.toThrow('restarted after cancellation')

    controller.abort()

    await Promise.all([staleRejected, peerRejected])
    expect(first.worker.terminate).toHaveBeenCalledOnce()
    expect(first.listeners.size).toBe(0)
    await expect(client.stats('new')).resolves.toEqual({ characters: 3, lines: 1, words: 1 })
  })
})
