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

type IdleWorker<TWorker> = {
  deadline: number
  worker: TWorker
}

const createAbortError = () => new DOMException('Aborted', 'AbortError')
const DEFAULT_IDLE_TTL_MS = 30_000

export class BoundedWorkerPool<TWorker extends ReusableWorker> {
  private readonly createWorker: () => TWorker
  private idleCleanupTimer: ReturnType<typeof setTimeout> | null = null
  private readonly idleWorkers: Array<IdleWorker<TWorker>> = []
  private readonly idleTtlMs: number
  private readonly maxWorkers: number
  private readonly waiters: Array<WorkerWaiter<TWorker>> = []
  private terminatedError: Error | null = null
  private workerCount = 0

  constructor(createWorker: () => TWorker, maxWorkers: number, idleTtlMs = DEFAULT_IDLE_TTL_MS) {
    this.createWorker = createWorker
    this.idleTtlMs = Number.isFinite(idleTtlMs)
      ? Math.max(0, Math.floor(idleTtlMs))
      : DEFAULT_IDLE_TTL_MS
    this.maxWorkers = Math.max(1, Math.floor(maxWorkers))
  }

  acquire(signal?: AbortSignal): Promise<TWorker> | TWorker {
    if (this.terminatedError) return Promise.reject(this.terminatedError)
    if (signal?.aborted) return Promise.reject(createAbortError())
    const idleWorker = this.idleWorkers.pop()
    if (idleWorker) {
      this.scheduleIdleCleanup()
      return idleWorker.worker
    }
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
    try {
      while (this.workerCount < target) {
        const worker = this.createWorker()
        this.workerCount += 1
        this.idleWorkers.push(this.createIdleWorker(worker))
      }
    } finally {
      this.scheduleIdleCleanup()
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
      this.idleWorkers.push(this.createIdleWorker(worker))
      this.scheduleIdleCleanup()
      return
    }
    this.terminateWorker(worker)
    this.workerCount -= 1
    this.fillWaitingSlot()
  }

  terminate(error = new Error('Worker pool terminated.')): void {
    if (this.terminatedError) return
    this.terminatedError = error
    this.clearIdleCleanup()
    for (const waiter of this.waiters.splice(0)) {
      this.detachWaiter(waiter)
      waiter.reject(error)
    }
    for (const { worker } of this.idleWorkers.splice(0)) {
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

  private scheduleIdleCleanup(): void {
    this.clearIdleCleanup()
    let nearestDeadline = Number.POSITIVE_INFINITY
    for (const idleWorker of this.idleWorkers) {
      nearestDeadline = Math.min(nearestDeadline, idleWorker.deadline)
    }
    if (!Number.isFinite(nearestDeadline)) return

    this.idleCleanupTimer = setTimeout(
      () => {
        this.idleCleanupTimer = null
        const now = Date.now()
        for (let index = this.idleWorkers.length - 1; index >= 0; index -= 1) {
          const idleWorker = this.idleWorkers[index]
          if (idleWorker.deadline > now) continue
          this.idleWorkers.splice(index, 1)
          this.terminateWorker(idleWorker.worker)
          this.workerCount -= 1
        }
        this.scheduleIdleCleanup()
      },
      Math.max(0, nearestDeadline - Date.now()),
    )
  }

  private createIdleWorker(worker: TWorker): IdleWorker<TWorker> {
    return { deadline: Date.now() + this.idleTtlMs, worker }
  }

  private clearIdleCleanup(): void {
    if (this.idleCleanupTimer === null) return
    clearTimeout(this.idleCleanupTimer)
    this.idleCleanupTimer = null
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
