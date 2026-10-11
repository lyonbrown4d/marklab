import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PlateDocumentFindWorkerClient,
  type PlateDocumentFindWorkerPort,
} from '@/services/plateDocumentFindWorkerClient'

class FakeWorker implements PlateDocumentFindWorkerPort {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly sent: unknown[] = []
  terminated = false

  postMessage(message: unknown) {
    this.sent.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

const request = {
  options: { matchCase: false, useRegex: true as const, wholeWord: false },
  query: 'alpha',
  source: [{ entries: [{ path: [0, 0], text: 'alpha' }] }],
}

describe('PlateDocumentFindWorkerClient', () => {
  afterEach(() => vi.useRealTimers())

  it('resolves structured matches returned by the worker', async () => {
    const worker = new FakeWorker()
    const client = new PlateDocumentFindWorkerClient(() => worker)
    const pending = client.scan(request)
    const match = {
      anchor: { offset: 0, path: [0, 0] },
      focus: { offset: 5, path: [0, 0] },
      regex: { captures: [], groups: {}, match: 'alpha', prefix: '', suffix: '' },
    }

    worker.emit({ id: 1, matches: [match], ok: true })

    await expect(pending).resolves.toEqual([match])
  })

  it('terminates a busy worker on cancellation and ignores its stale response', async () => {
    const firstWorker = new FakeWorker()
    const secondWorker = new FakeWorker()
    const workers = [firstWorker, secondWorker]
    const client = new PlateDocumentFindWorkerClient(() => workers.shift()!)
    const controller = new AbortController()
    const stale = client.scan(request, controller.signal)

    controller.abort()
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    expect(firstWorker.terminated).toBe(true)
    expect(workers).toHaveLength(1)

    const current = client.scan({ ...request, query: 'beta' })
    expect(workers).toHaveLength(0)
    const replacement = {
      anchor: { offset: 0, path: [0, 0] },
      focus: { offset: 4, path: [0, 0] },
      regex: { captures: [], groups: {}, match: 'beta', prefix: '', suffix: '' },
    }
    firstWorker.emit({ id: 1, matches: [], ok: true })
    secondWorker.emit({ id: 2, matches: [replacement], ok: true })

    await expect(current).resolves.toEqual([replacement])
  })

  it('terminates a pathological scan after its execution budget', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const client = new PlateDocumentFindWorkerClient(() => worker, 50)
    const pending = client.scan(request)
    const rejected = expect(pending).rejects.toThrow('scanTimedOut')

    await vi.advanceTimersByTimeAsync(50)

    await rejected
    expect(worker.terminated).toBe(true)
  })

  it('rejects a postMessage failure without leaving a timed task behind', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    worker.postMessage = () => {
      throw new Error('clone failed')
    }
    const client = new PlateDocumentFindWorkerClient(() => worker, 50)

    await expect(client.scan(request)).rejects.toThrow('clone failed')
    await vi.advanceTimersByTimeAsync(50)
    expect(worker.terminated).toBe(false)
  })

  it('reports worker construction failures through the async boundary', async () => {
    const client = new PlateDocumentFindWorkerClient(() => {
      throw new Error('worker unavailable')
    })

    await expect(client.scan(request)).rejects.toThrow('worker unavailable')
  })
})
