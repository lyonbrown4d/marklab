import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlateMarkdownWorkerClient } from '@/services/plateMarkdownWorkerClient'
import type { PlateMarkdownWorkerRequest } from '@/workers/plateMarkdownWorkerProtocol'

class FakeWorker {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  postMessage = vi.fn<(message: PlateMarkdownWorkerRequest) => void>()
  terminate = vi.fn()
  respond(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

const setup = () => {
  const workers: FakeWorker[] = []
  const client = new PlateMarkdownWorkerClient(() => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  return { client, workers }
}

describe('ordinary Markdown worker idle lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('releases a completed worker after 30 seconds and recreates it on demand', async () => {
    const { client, workers } = setup()
    const request = client.parse('First')
    workers[0].respond({ id: 1, ok: true, operation: 'parse', value: [] })
    await expect(request).resolves.toEqual([])
    vi.advanceTimersByTime(29_999)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(workers[0].onmessage).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    const next = client.serialize([])
    expect(workers).toHaveLength(2)
    workers[1].respond({ id: 2, ok: true, operation: 'serialize', markdown: 'Next' })
    await expect(next).resolves.toBe('Next')
    client.terminate()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for every concurrent request before starting its idle deadline', async () => {
    const { client, workers } = setup()
    const first = client.parse('First')
    const second = client.serialize([])
    workers[0].respond({ id: 1, ok: true, operation: 'parse', value: [] })
    await first
    vi.advanceTimersByTime(60_000)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    workers[0].respond({ id: 2, ok: true, operation: 'serialize', markdown: '' })
    await second
    vi.advanceTimersByTime(30_000)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
  })

  it('cancels an idle deadline during new work and starts a fresh deadline on completion', async () => {
    const { client, workers } = setup()
    const first = client.parse('First')
    workers[0].respond({ id: 1, ok: true, operation: 'parse', value: [] })
    await first
    vi.advanceTimersByTime(29_000)
    const second = client.parse('Second')
    vi.advanceTimersByTime(60_000)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    workers[0].respond({ id: 2, ok: true, operation: 'parse', value: [] })
    await second
    vi.advanceTimersByTime(29_999)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
  })

  it('aborts one concurrent request without terminating the other and removes its listener', async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const first = client.parse('First', controller.signal)
    const second = client.parse('Second')
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    vi.advanceTimersByTime(60_000)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    workers[0].respond({ id: 2, ok: true, operation: 'parse', value: [] })
    await second
    vi.advanceTimersByTime(30_000)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
  })

  it('releases the last aborted request immediately without retaining an idle timer', async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const request = client.parse('First', controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { ok: false, error: 'Parse failed', operation: 'parse' },
    { ok: true, markdown: '', operation: 'serialize' },
  ])('releases settled failed requests and allows a new request: %j', async (response) => {
    const { client, workers } = setup()
    const request = client.parse('First')
    workers[0].respond({ ...response, id: 1 })
    await expect(request).rejects.toThrow()
    vi.advanceTimersByTime(30_000)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    const retry = client.parse('Retry')
    workers[1].respond({ id: 2, ok: true, operation: 'parse', value: [] })
    await expect(retry).resolves.toEqual([])
    client.terminate()
  })

  it('rejects all requests on worker errors, permits retry, and preserves the stream pool', async () => {
    const { client, workers } = setup()
    client.preloadStreams(1)
    const first = client.parse('First')
    const second = client.serialize([])
    const staleMessage = workers[1].onmessage
    workers[1].onerror?.({ message: 'Crashed' } as ErrorEvent)
    await expect(first).rejects.toThrow('Crashed')
    await expect(second).rejects.toThrow('Crashed')
    expect(workers[0].terminate).not.toHaveBeenCalled()
    expect(workers[1].terminate).toHaveBeenCalledOnce()

    const retry = client.parse('Retry')
    staleMessage?.({
      data: { id: 3, ok: true, operation: 'parse', value: ['stale'] },
    } as MessageEvent)
    workers[2].respond({ id: 3, ok: true, operation: 'parse', value: [] })
    await expect(retry).resolves.toEqual([])
    const stream = client.prepareStream('Stream')
    workers[0].respond({ id: 1, ok: true, operation: 'prepare-stream' })
    await expect(stream).resolves.toBeUndefined()
    client.terminate()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not create workers for already aborted requests', async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    controller.abort()
    await expect(client.parse('First', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(client.serialize([], controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(workers).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
