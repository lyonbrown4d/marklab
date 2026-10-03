import type { Value } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import { PlateMarkdownWorkerClient } from '@/services/plateMarkdownWorkerClient'

type WorkerMessage = {
  id: number
  markdown?: string
  operation: 'cancel' | 'parse' | 'parse-next' | 'parse-stream' | 'prepare-stream' | 'serialize'
  value?: Value
}

class FakeWorker {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly postMessage = vi.fn<(message: WorkerMessage) => void>()
  readonly terminate = vi.fn()

  respond(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

describe('PlateMarkdownWorkerClient stream lifecycle', () => {
  it('cancels without accepting later chunks', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const controller = new AbortController()
    const onChunk = vi.fn()
    const request = client.parseIncrementally('Large', onChunk, controller.signal)

    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.respond({
      done: true,
      id: 1,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Late' }] }],
    })
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('does not request another chunk when cancelled during consumer backpressure', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const controller = new AbortController()
    let releaseChunk: (() => void) | undefined
    const request = client.parseIncrementally(
      'Large',
      () => new Promise<void>((resolve) => (releaseChunk = resolve)),
      controller.signal,
    )

    worker.respond({
      done: false,
      id: 1,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Chunk' }] }],
    })
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    releaseChunk?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(worker.postMessage).not.toHaveBeenCalledWith({ id: 1, operation: 'parse-next' })
  })

  it('isolates concurrent streams so stale CPU work cannot block the latest job', async () => {
    const workers: FakeWorker[] = []
    const client = new PlateMarkdownWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })
    const staleController = new AbortController()
    const stale = client.parseIncrementally('Stale', vi.fn(), staleController.signal)
    const latestChunk = vi.fn()
    const latest = client.parseIncrementally('Latest', latestChunk)

    staleController.abort()
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0]?.terminate).toHaveBeenCalledOnce()
    workers[1]?.respond({
      done: true,
      id: 2,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Latest' }] }],
    })
    await expect(latest).resolves.toBeUndefined()
    expect(latestChunk).toHaveBeenCalledWith([{ type: 'p', children: [{ text: 'Latest' }] }])
  })

  it('terminates when a chunk consumer throws synchronously', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const request = client.parseIncrementally('Large', () => {
      throw new Error('Hydration failed')
    })

    worker.respond({
      done: false,
      id: 1,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Chunk' }] }],
    })

    await expect(request).rejects.toThrow('Hydration failed')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects when a streamed worker cannot be created', async () => {
    const client = new PlateMarkdownWorkerClient(() => {
      throw new Error('Worker construction failed')
    })

    await expect(client.parseIncrementally('Large', vi.fn())).rejects.toThrow(
      'Worker construction failed',
    )
  })

  it('terminates when requesting the next chunk fails', async () => {
    const worker = new FakeWorker()
    worker.postMessage.mockImplementation((message) => {
      if (message.operation === 'parse-next') throw new Error('Worker channel closed')
    })
    const client = new PlateMarkdownWorkerClient(() => worker)
    const request = client.parseIncrementally('Large', vi.fn())

    worker.respond({
      done: false,
      id: 1,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Chunk' }] }],
    })

    await expect(request).rejects.toThrow('Worker channel closed')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
