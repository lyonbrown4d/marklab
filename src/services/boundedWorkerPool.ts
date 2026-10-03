export type ReusableWorker = {
  onerror: ((event: ErrorEvent) => void) | null
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  terminate(): void
}

type WorkerWaiter<TWorker> = {
  reject: (error: Error) => void
  resolve: (worker: TWorker) => void
  signal?: AbortSignal
  onAbort?: () => void
}

const createAbortError = () => new DOMException('Aborted', 'AbortError')

export class BoundedWorkerPool<TWorker extends ReusableWorker> {
  private readonly createWorker: () => TWorker
  private readonly idleWorkers: TWorker[] = []
  private readonly maxWorkers: number
  private readonly waiters: Array<WorkerWaiter<TWorker>> = []
  private terminatedError: Error | null = null
  private workerCount = 0

  constructor(createWorker: () => TWorker, maxWorkers: number) {
    this.createWorker = createWorker
    this.maxWorkers = Math.max(1, Math.floor(maxWorkers))
  }

  acquire(signal?: AbortSignal): Promise<TWorker> | TWorker {
    if (this.terminatedError) return Promise.reject(this.terminatedError)
    if (signal?.aborted) return Promise.reject(createAbortError())
    const idleWorker = this.idleWorkers.pop()
    if (idleWorker) return idleWorker
    if (this.workerCount < this.maxWorkers) {
      try {
        const worker = this.createWorker()
        this.workerCount += 1
        return worker
      } catch (error) {
        return Promise.reject(this.normalizeCreationError(error))
      }
    }
    return new Promise((resolve, reject) => {
      const waiter: WorkerWaiter<TWorker> = { reject, resolve, signal }
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(createAbortError())
      }
      waiter.onAbort = onAbort
      signal?.addEventListener('abort', onAbort, { once: true })
      this.waiters.push(waiter)
    })
  }

  preload(targetWorkerCount = this.maxWorkers): void {
    if (this.terminatedError) throw this.terminatedError
    const target = Math.min(this.maxWorkers, Math.max(0, Math.floor(targetWorkerCount)))
    while (this.workerCount < target) {
      const worker = this.createWorker()
      this.workerCount += 1
      this.idleWorkers.push(worker)
    }
  }

  release(worker: TWorker, reusable: boolean): void {
    worker.onerror = null
    worker.onmessage = null
    if (this.terminatedError) {
      this.terminateWorker(worker)
      this.workerCount -= 1
      return
    }
    if (reusable) {
      const waiter = this.takeWaiter()
      if (waiter) {
        waiter.resolve(worker)
        return
      }
      this.idleWorkers.push(worker)
      return
    }
    this.terminateWorker(worker)
    this.workerCount -= 1
    this.fillWaitingSlot()
  }

  terminate(error = new Error('Worker pool terminated.')): void {
    if (this.terminatedError) return
    this.terminatedError = error
    for (const waiter of this.waiters.splice(0)) {
      this.detachWaiter(waiter)
      waiter.reject(error)
    }
    for (const worker of this.idleWorkers.splice(0)) {
      this.terminateWorker(worker)
      this.workerCount -= 1
    }
  }

  private fillWaitingSlot(): void {
    const waiter = this.takeWaiter()
    if (!waiter) return
    try {
      const worker = this.createWorker()
      this.workerCount += 1
      waiter.resolve(worker)
    } catch (error) {
      waiter.reject(this.normalizeCreationError(error))
      this.fillWaitingSlot()
    }
  }

  private takeWaiter(): WorkerWaiter<TWorker> | undefined {
    const waiter = this.waiters.shift()
    if (waiter) this.detachWaiter(waiter)
    return waiter
  }

  private detachWaiter(waiter: WorkerWaiter<TWorker>): void {
    if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort)
  }

  private normalizeCreationError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Worker creation failed.')
  }

  private terminateWorker(worker: TWorker): void {
    try {
      worker.terminate()
    } catch {
      // The worker may already have torn down its message channel.
    }
  }
}
