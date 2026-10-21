import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlateDocumentFindWorkerClient } from '@/services/plateDocumentFindWorkerClient'
import { createComlinkTestWorker } from '@/test/comlinkTestWorker'
import { plateDocumentFindWorkerApi } from '@/workers/plateDocumentFindWorkerApi'

const request = {
  options: { matchCase: false, useRegex: true as const, wholeWord: false },
  query: 'alpha',
  source: [{ entries: [{ path: [0, 0], text: 'alpha' }] }],
}
const clients: PlateDocumentFindWorkerClient[] = []
const pendingApi = { scan: () => new Promise(() => {}) }
const createClient = (api: object = plateDocumentFindWorkerApi, timeoutMs?: number) => {
  const testWorker = createComlinkTestWorker(api)
  const client = new PlateDocumentFindWorkerClient(() => testWorker.worker, timeoutMs)
  clients.push(client)
  return { client, ...testWorker }
}

describe('PlateDocumentFindWorkerClient', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.terminate())
    vi.useRealTimers()
  })

  it('returns structured matches and forwards model errors', async () => {
    const { client } = createClient()
    const match = {
      anchor: { offset: 0, path: [0, 0] },
      focus: { offset: 5, path: [0, 0] },
      regex: { captures: [], groups: {}, match: 'alpha', prefix: '', suffix: '' },
    }

    await expect(client.scan(request)).resolves.toEqual([match])
    await expect(client.scan({ ...request, query: '[' })).rejects.toThrow('invalidRegex')
    await expect(client.scan(request)).resolves.toEqual([match])
  })

  it('terminates a busy worker on cancellation and starts a replacement', async () => {
    const first = createComlinkTestWorker(pendingApi)
    const second = createComlinkTestWorker(plateDocumentFindWorkerApi)
    const workers = [first.worker, second.worker]
    const client = new PlateDocumentFindWorkerClient(() => workers.shift()!)
    clients.push(client)
    const controller = new AbortController()
    const stale = client.scan(request, controller.signal)
    const rejected = expect(stale).rejects.toMatchObject({ name: 'AbortError' })

    controller.abort()

    await rejected
    expect(first.worker.terminate).toHaveBeenCalledOnce()
    expect(first.listeners.size).toBe(0)
    await expect(client.scan(request)).resolves.toHaveLength(1)
  })

  it('terminates pathological scans and rejects pending peers after their execution budget', async () => {
    vi.useFakeTimers()
    const { client, worker, listeners } = createClient(pendingApi, 50)
    const rejected = expect(client.scan(request)).rejects.toThrow('scanTimedOut')
    const peerRejected = expect(client.scan(request)).rejects.toThrow(
      'restarted after cancellation',
    )

    await vi.advanceTimersByTimeAsync(50)

    await Promise.all([rejected, peerRejected])
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['error', 'messageerror', 'terminate'] as const)(
    'rejects pending calls and removes listeners on %s',
    async (failure) => {
      vi.useFakeTimers()
      const { client, worker, listeners } = createClient(pendingApi)
      const rejected = expect(client.scan(request)).rejects.toThrow(
        failure === 'error' ? 'crashed' : failure === 'messageerror' ? 'decoded' : 'terminated',
      )
      if (failure === 'error') worker.onerror?.({ message: 'crashed' } as ErrorEvent)
      else if (failure === 'messageerror') {
        worker.onmessageerror?.(new MessageEvent('messageerror'))
      } else client.terminate()

      await rejected
      expect(worker.terminate).toHaveBeenCalledOnce()
      expect(listeners.size).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('cleans up transport failures without leaving timed tasks or RPC listeners', async () => {
    vi.useFakeTimers()
    const { client, worker, listeners } = createClient(pendingApi, 50)
    worker.postMessage = () => {
      throw new Error('clone failed')
    }

    await expect(client.scan(request)).rejects.toThrow('clone failed')
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects construction failures asynchronously and skips pre-aborted requests', async () => {
    const createWorker = vi.fn(() => {
      throw new Error('worker unavailable')
    })
    const client = new PlateDocumentFindWorkerClient(createWorker)
    clients.push(client)
    const controller = new AbortController()
    controller.abort()

    await expect(client.scan(request, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(createWorker).not.toHaveBeenCalled()
    await expect(client.scan(request)).rejects.toThrow('worker unavailable')
  })
})
