import type { Logger } from '@electron/services/logger'
import { scheduleWorkspacePrewarm } from '@electron/services/workspace/workspacePrewarmScheduler'

type WorkspaceIndexPrewarmerOptions = {
  delayMs: number
  logger: Pick<Logger, 'warn'>
  run: () => Promise<unknown>
  schedule?: (task: () => Promise<unknown>, signal: AbortSignal) => Promise<unknown>
}

type ScheduledRun = { controller: AbortController; started: boolean }

export class WorkspaceIndexPrewarmer {
  private disposed = false
  private generation = 0
  private readonly runs = new Set<ScheduledRun>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: WorkspaceIndexPrewarmerOptions) {}

  schedule(): void {
    if (this.disposed) return
    const generation = this.invalidatePending()
    this.timer = setTimeout(
      () => {
        this.timer = null
        const scheduledRun = { controller: new AbortController(), started: false }
        this.runs.add(scheduledRun)
        const schedule = this.options.schedule ?? scheduleWorkspacePrewarm
        void schedule(async () => {
          if (this.disposed || generation !== this.generation) return
          scheduledRun.started = true
          await this.options.run()
        }, scheduledRun.controller.signal)
          .catch((error) => {
            if (!this.disposed && !isAbortError(error)) {
              this.options.logger.warn('workspace index precompute failed', { error })
            }
          })
          .finally(() => this.runs.delete(scheduledRun))
      },
      Math.max(0, this.options.delayMs),
    )
  }

  cancel(): void {
    this.invalidatePending()
  }

  dispose(): void {
    this.disposed = true
    this.invalidatePending()
  }

  private invalidatePending(): number {
    this.generation += 1
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const run of this.runs) {
      if (!run.started) run.controller.abort()
    }
    return this.generation
  }
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'
