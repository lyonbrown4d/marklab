export type ReusableWorker = {
  onerror: ((event: ErrorEvent) => void) | null
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  terminate(): void
}

export class BoundedWorkerPool<TWorker extends ReusableWorker> {
  private readonly createWorker: () => TWorker
  private readonly idleWorkers: TWorker[] = []
  private readonly maxIdleWorkers: number

  constructor(createWorker: () => TWorker, maxIdleWorkers: number) {
    this.createWorker = createWorker
    this.maxIdleWorkers = maxIdleWorkers
  }

  acquire(): TWorker {
    return this.idleWorkers.pop() ?? this.createWorker()
  }

  release(worker: TWorker, reusable: boolean): void {
    worker.onerror = null
    worker.onmessage = null
    if (reusable && this.idleWorkers.length < this.maxIdleWorkers) {
      this.idleWorkers.push(worker)
      return
    }
    this.terminateWorker(worker)
  }

  terminate(): void {
    for (const worker of this.idleWorkers.splice(0)) this.terminateWorker(worker)
  }

  private terminateWorker(worker: TWorker): void {
    try {
      worker.terminate()
    } catch {
      // The worker may already have torn down its message channel.
    }
  }
}
