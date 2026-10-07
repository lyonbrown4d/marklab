import PQueue from 'p-queue'

type GraphComputationPriority = 'background' | 'interactive'

type GraphComputation<T> = {
  priority: GraphComputationPriority
  revision: string
  task: () => Promise<T>
  workspaceKey: string
}

const PRIORITY = { background: 0, interactive: 10 } as const
const DEFAULT_CONCURRENCY = 3

export class WorkspaceGraphComputationScheduler {
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private readonly latestRevision = new Map<string, string>()
  private readonly queued = new Set<string>()
  private readonly queue: PQueue

  constructor(options: { concurrency?: number } = {}) {
    this.queue = new PQueue({
      concurrency: Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY)),
    })
  }

  run<T>({ priority, revision, task, workspaceKey }: GraphComputation<T>): Promise<T> {
    this.latestRevision.set(workspaceKey, revision)
    const taskKey = `${workspaceKey}\0${revision}`
    const current = this.inFlight.get(taskKey) as Promise<T> | undefined
    if (current) {
      if (priority === 'interactive' && this.queued.has(taskKey)) {
        this.queue.setPriority(taskKey, PRIORITY.interactive)
      }
      return current
    }

    this.queued.add(taskKey)
    const promise = this.queue
      .add(
        () => {
          this.queued.delete(taskKey)
          return task()
        },
        { id: taskKey, priority: PRIORITY[priority] },
      )
      .finally(() => {
        this.queued.delete(taskKey)
        if (this.inFlight.get(taskKey) === promise) this.inFlight.delete(taskKey)
      }) as Promise<T>
    this.inFlight.set(taskKey, promise)
    return promise
  }

  isCurrent(workspaceKey: string, revision: string): boolean {
    return this.latestRevision.get(workspaceKey) === revision
  }
}
