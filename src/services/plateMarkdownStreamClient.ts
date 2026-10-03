import type { Value } from 'platejs'
import { BoundedWorkerPool, type ReusableWorker } from '@/services/boundedWorkerPool'
import type {
  PlateMarkdownWorkerRequest,
  PlateMarkdownWorkerResponse,
} from '@/workers/plateMarkdownWorkerProtocol'

export type PlateMarkdownWorkerPort = ReusableWorker & {
  postMessage(message: PlateMarkdownWorkerRequest): void
}

const createAbortError = () => new DOMException('Aborted', 'AbortError')

export class PlateMarkdownStreamClient {
  private readonly activeFailures = new Map<PlateMarkdownWorkerPort, (error: Error) => void>()
  private nextId = 1
  private readonly pool: BoundedWorkerPool<PlateMarkdownWorkerPort>

  constructor(createWorker: () => PlateMarkdownWorkerPort, poolSize: number) {
    this.pool = new BoundedWorkerPool(createWorker, poolSize)
  }

  preload(targetWorkerCount?: number): void {
    this.pool.preload(targetWorkerCount)
  }

  prepare(markdown: string, signal?: AbortSignal): Promise<void> {
    return this.run(markdown, 'prepare-stream', undefined, signal)
  }

  parse(
    markdown: string,
    onChunk: (value: Value) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.run(markdown, 'parse-stream', onChunk, signal)
  }

  terminate(error: Error): void {
    this.pool.terminate(error)
    for (const fail of [...this.activeFailures.values()]) fail(error)
  }

  private run(
    markdown: string,
    operation: 'parse-stream' | 'prepare-stream',
    onChunk?: (value: Value) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) return Promise.reject(createAbortError())
    const id = this.nextId++
    let acquisition: PlateMarkdownWorkerPort | Promise<PlateMarkdownWorkerPort>
    try {
      acquisition = this.pool.acquire(signal)
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Markdown worker creation failed.'),
      )
    }
    if (acquisition instanceof Promise) {
      return acquisition.then(
        (worker) => this.runWithWorker(worker, id, markdown, operation, onChunk, signal),
        (error: unknown) =>
          Promise.reject(
            error instanceof Error ? error : new Error('Markdown worker creation failed.'),
          ),
      )
    }
    return this.runWithWorker(acquisition, id, markdown, operation, onChunk, signal)
  }

  private runWithWorker(
    worker: PlateMarkdownWorkerPort,
    id: number,
    markdown: string,
    operation: 'parse-stream' | 'prepare-stream',
    onChunk?: (value: Value) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      this.pool.release(worker, true)
      return Promise.reject(createAbortError())
    }
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = (reusable: boolean) => {
        signal?.removeEventListener('abort', onAbort)
        this.activeFailures.delete(worker)
        this.pool.release(worker, reusable)
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup(false)
        reject(error)
      }
      const succeed = () => {
        if (settled) return
        settled = true
        cleanup(true)
        resolve()
      }
      const onAbort = () => fail(createAbortError())
      this.activeFailures.set(worker, fail)
      signal?.addEventListener('abort', onAbort, { once: true })
      worker.onerror = (event) => fail(new Error(event.message || 'Markdown worker failed.'))
      worker.onmessage = ({ data }) => {
        const message = data as PlateMarkdownWorkerResponse
        if (settled || message.id !== id) return
        if (message.operation !== operation) {
          fail(new Error('Unexpected Markdown worker response.'))
          return
        }
        if (!message.ok) {
          fail(new Error(message.error))
          return
        }
        if (message.operation === 'prepare-stream') {
          succeed()
          return
        }
        this.consumeChunk(worker, id, message, onChunk, () => settled, succeed, fail)
      }
      try {
        worker.postMessage({ id, markdown, operation })
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Markdown worker request failed.'))
      }
    })
  }

  private consumeChunk(
    worker: PlateMarkdownWorkerPort,
    id: number,
    message: Extract<PlateMarkdownWorkerResponse, { operation: 'parse-stream'; ok: true }>,
    onChunk: ((value: Value) => Promise<void> | void) | undefined,
    isSettled: () => boolean,
    succeed: () => void,
    fail: (error: Error) => void,
  ): void {
    let task: Promise<void>
    try {
      task = Promise.resolve(onChunk?.(message.value))
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Markdown hydration failed.'))
      return
    }
    void task.then(
      () => {
        if (isSettled()) return
        if (message.done) {
          succeed()
          return
        }
        try {
          worker.postMessage({ id, operation: 'parse-next' })
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Markdown worker request failed.'))
        }
      },
      (error: unknown) =>
        fail(error instanceof Error ? error : new Error('Markdown hydration failed.')),
    )
  }
}
