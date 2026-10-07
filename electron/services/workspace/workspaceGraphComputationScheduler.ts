import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'

type GraphComputationPriority = 'background' | 'interactive'

type GraphComputation<T> = {
  priority: GraphComputationPriority
  revision: string
  task: () => Promise<T>
  workspaceKey: string
}

const PRIORITY = { background: 0, interactive: 10 } as const
export class WorkspaceGraphComputationScheduler {
  private readonly inFlight = new Map<string, Promise<unknown>>()
  private readonly latestRevision = new Map<string, string>()
  private readonly queued = new Set<string>()
  private readonly scheduler: WorkspaceAnalysisScheduler

  constructor(options: { concurrency?: number; scheduler?: WorkspaceAnalysisScheduler } = {}) {
    this.scheduler =
      options.scheduler ?? new WorkspaceAnalysisScheduler({ concurrency: options.concurrency })
  }

  run<T>({ priority, revision, task, workspaceKey }: GraphComputation<T>): Promise<T> {
    this.latestRevision.set(workspaceKey, revision)
    const taskKey = `graph:${workspaceKey}\0${revision}`
    const current = this.inFlight.get(taskKey) as Promise<T> | undefined
    if (current) {
      if (priority === 'interactive' && this.queued.has(taskKey)) {
        this.scheduler.setPriority(taskKey, PRIORITY.interactive)
      }
      return current
    }

    this.queued.add(taskKey)
    const promise = this.scheduler
      .run(
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
