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

describe('PlateMarkdownWorkerClient streaming', () => {
  it('preloads three stream workers for future large documents', () => {
    const workers: FakeWorker[] = []
    const client = new PlateMarkdownWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })

    client.preloadStreams()

    expect(workers).toHaveLength(3)
    client.terminate()
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true)
  })

  it('prepares a document on a reusable worker before streaming it', async () => {
    const workers: FakeWorker[] = []
    const client = new PlateMarkdownWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })
    const preparation = client.prepareStream('Cached document')

    expect(workers[0]?.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      markdown: 'Cached document',
      operation: 'prepare-stream',
    })
    workers[0]?.respond({ id: 1, ok: true, operation: 'prepare-stream' })
    await expect(preparation).resolves.toBeUndefined()

    const stream = client.parseIncrementally('Cached document', vi.fn())
    expect(workers).toHaveLength(1)
    expect(workers[0]?.postMessage).toHaveBeenLastCalledWith({
      id: 2,
      markdown: 'Cached document',
      operation: 'parse-stream',
    })
    workers[0]?.respond({
      done: true,
      id: 2,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Cached document' }] }],
    })
    await expect(stream).resolves.toBeUndefined()
  })

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

  it('queues a fourth stream until one of three active workers is reusable', async () => {
    const workers: FakeWorker[] = []
    const client = new PlateMarkdownWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })
    const requests = Array.from({ length: 4 }, (_, index) =>
      client.parseIncrementally(`Document ${index}`, vi.fn()),
    )

    expect(workers).toHaveLength(3)
    workers.forEach((worker, index) => {
      worker.respond({
        done: true,
        id: index + 1,
        ok: true,
        operation: 'parse-stream',
        value: [{ type: 'p', children: [{ text: `Document ${index}` }] }],
      })
    })
    await Promise.resolve()
    await Promise.resolve()
    const reusedWorker = workers.find((worker) =>
      worker.postMessage.mock.calls.some(([message]) => message.id === 4),
    )
    expect(reusedWorker).toBeDefined()
    reusedWorker?.respond({
      done: true,
      id: 4,
      ok: true,
      operation: 'parse-stream',
      value: [{ type: 'p', children: [{ text: 'Document 3' }] }],
    })
    await Promise.all(requests)

    expect(workers).toHaveLength(3)
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 0)).toBe(true)

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
})
