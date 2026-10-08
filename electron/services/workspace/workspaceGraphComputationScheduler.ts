import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'

type GraphComputationPriority = 'background' | 'interactive'

type GraphComputation<T> = {
  onStarted?: () => void
  priority: GraphComputationPriority
  revision: string
  signal?: AbortSignal
  task: () => Promise<T>
  workspaceKey: string
}

type InFlightGraphComputation<T> = {
  consumers: number
  controller: AbortController
  onStarted: Set<() => void>
  promise: Promise<T>
  started: boolean
}

const PRIORITY = { background: 0, interactive: 10 } as const
export class WorkspaceGraphComputationScheduler {
  private readonly inFlight = new Map<string, InFlightGraphComputation<unknown>>()
  private readonly latestRevision = new Map<string, string>()
  private readonly queued = new Set<string>()
  private readonly scheduler: WorkspaceAnalysisScheduler

  constructor(options: { concurrency?: number; scheduler?: WorkspaceAnalysisScheduler } = {}) {
    this.scheduler =
      options.scheduler ?? new WorkspaceAnalysisScheduler({ concurrency: options.concurrency })
  }

  run<T>({
    onStarted,
    priority,
    revision,
    signal,
    task,
    workspaceKey,
  }: GraphComputation<T>): Promise<T> {
    this.latestRevision.set(workspaceKey, revision)
    const taskKey = `graph:${workspaceKey}\0${revision}`
    const current = this.inFlight.get(taskKey) as InFlightGraphComputation<T> | undefined
    if (current) {
      if (priority === 'interactive' && this.queued.has(taskKey)) {
        this.scheduler.setPriority(taskKey, PRIORITY.interactive)
      }
      return this.subscribe(current, signal, onStarted)
    }

    const record: InFlightGraphComputation<T> = {
      consumers: 0,
      controller: new AbortController(),
      onStarted: new Set(),
      promise: Promise.resolve(null as T),
      started: false,
    }
    this.queued.add(taskKey)
    const promise = this.scheduler
      .run(
        () => {
          this.queued.delete(taskKey)
          record.started = true
          for (const notify of record.onStarted) notify()
          record.onStarted.clear()
          return task()
        },
        { id: taskKey, priority: PRIORITY[priority], signal: record.controller.signal },
      )
      .finally(() => {
        this.queued.delete(taskKey)
        if (this.inFlight.get(taskKey) === record) this.inFlight.delete(taskKey)
      }) as Promise<T>
    record.promise = promise
    this.inFlight.set(taskKey, record as InFlightGraphComputation<unknown>)
    return this.subscribe(record, signal, onStarted)
  }

  isCurrent(workspaceKey: string, revision: string): boolean {
    return this.latestRevision.get(workspaceKey) === revision
  }

  private subscribe<T>(
    record: InFlightGraphComputation<T>,
    signal?: AbortSignal,
    onStarted?: () => void,
  ): Promise<T> {
    record.consumers += 1
    if (record.started) onStarted?.()
    else if (onStarted) record.onStarted.add(onStarted)

    return new Promise<T>((resolve, reject) => {
      let settled = false
      const settle = (callback: () => void): void => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', abort)
        if (onStarted) record.onStarted.delete(onStarted)
        record.consumers -= 1
        if (!record.started && record.consumers === 0) record.controller.abort()
        callback()
      }
      const abort = (): void => settle(() => reject(signal?.reason ?? createAbortError()))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) {
        abort()
        return
      }
      void record.promise.then(
        (value) => settle(() => resolve(value)),
        (error: unknown) => settle(() => reject(error)),
      )
    })
  }
}

const createAbortError = (): Error =>
  Object.assign(new Error('This operation was aborted'), {
    name: 'AbortError',
  })
