import { AsyncLocalStorage } from 'node:async_hooks'

import PQueue from 'p-queue'

type WorkspaceAnalysisSchedulerOptions = {
  concurrency?: number
  maxPending?: number
}

export type WorkspaceAnalysisTaskOptions = {
  id?: string
  priority?: number
  signal?: AbortSignal
}

export class WorkspaceAnalysisScheduler {
  private readonly context = new AsyncLocalStorage<boolean>()
  private readonly queue: PQueue
  private readonly maxPending: number

  constructor({ concurrency = 3, maxPending = 24 }: WorkspaceAnalysisSchedulerOptions = {}) {
    this.queue = new PQueue({ concurrency })
    this.maxPending = maxPending
  }

  run<T>(
    task: () => Promise<T>,
    options: AbortSignal | WorkspaceAnalysisTaskOptions = {},
  ): Promise<T> {
    if (this.context.getStore()) return task()
    if (this.queue.size >= this.maxPending) {
      return Promise.reject(new Error('Workspace analysis queue is full.'))
    }
    const taskOptions = options instanceof AbortSignal ? { signal: options } : options
    return this.queue.add(() => this.context.run(true, task), taskOptions) as Promise<T>
  }

  setPriority(id: string, priority: number): void {
    this.queue.setPriority(id, priority)
  }

  get pending(): number {
    return this.queue.size
  }

  get running(): number {
    return this.queue.pending
  }
}
