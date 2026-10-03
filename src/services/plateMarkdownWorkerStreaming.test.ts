import type { Value } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import { PlateMarkdownWorkerClient } from '@/services/plateMarkdownWorkerClient'

type WorkerMessage = {
  id: number
  markdown?: string
  operation: 'cancel' | 'parse' | 'parse-next' | 'parse-stream' | 'serialize'
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

describe('PlateMarkdownWorkerClient streaming', () => {
  it('reuses a completed stream worker for the next large document', async () => {
    const workers: FakeWorker[] = []
    const client = new PlateMarkdownWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })
    const first = client.parseIncrementally('First', vi.fn())

    workers[0]?.respond({
      done: true,
      id: 1,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'First' }] }],
    })
    await first

    const secondChunk = vi.fn()
    const second = client.parseIncrementally('Second', secondChunk)

    expect(workers).toHaveLength(1)
    expect(workers[0]?.terminate).not.toHaveBeenCalled()
    workers[0]?.respond({
      done: true,
      id: 2,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Second' }] }],
    })
    await expect(second).resolves.toBeUndefined()
    expect(secondChunk).toHaveBeenCalledOnce()

    client.terminate()
    expect(workers[0]?.terminate).toHaveBeenCalledOnce()
  })

  it('keeps at most three completed stream workers warm', async () => {
    const workers: FakeWorker[] = []
    const client = new PlateMarkdownWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })
    const requests = Array.from({ length: 4 }, (_, index) =>
      client.parseIncrementally(`Document ${index}`, vi.fn()),
    )

    workers.forEach((worker, index) => {
      worker.respond({
        done: true,
        id: index + 1,
        ok: true,
        operation: 'parse-stream',
        value: [{ type: 'p', children: [{ text: `Document ${index}` }] }],
      })
    })
    await Promise.all(requests)

    expect(workers).toHaveLength(4)
    expect(workers.filter((worker) => worker.terminate.mock.calls.length === 0)).toHaveLength(3)
    expect(workers.filter((worker) => worker.terminate.mock.calls.length === 1)).toHaveLength(1)

    client.terminate()
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true)
  })

  it('applies chunks with consumer backpressure', async () => {
    const worker = new FakeWorker()
    const client = new PlateMarkdownWorkerClient(() => worker)
    const chunks: Value[] = []
    let releaseFirstChunk: (() => void) | undefined
    const request = client.parseIncrementally('# Large', async (chunk) => {
      chunks.push(chunk)
      if (chunks.length === 1) {
        await new Promise<void>((resolve) => (releaseFirstChunk = resolve))
      }
    })

    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      markdown: '# Large',
      operation: 'parse-stream',
    })
    worker.respond({
      done: false,
      id: 1,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'h1', children: [{ text: 'Large' }] }],
    })
    await Promise.resolve()
    expect(worker.postMessage).not.toHaveBeenCalledWith({ id: 1, operation: 'parse-next' })

    releaseFirstChunk?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(worker.postMessage).toHaveBeenLastCalledWith({ id: 1, operation: 'parse-next' })

    worker.respond({
      done: true,
      id: 1,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Body' }] }],
    })
    await expect(request).resolves.toBeUndefined()
    expect(chunks).toEqual([
      [{ type: 'h1', children: [{ text: 'Large' }] }],
      [{ type: 'p', children: [{ text: 'Body' }] }],
    ])
  })

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
