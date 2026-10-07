import type { Logger } from '@electron/services/logger'
import { scheduleWorkspacePrewarm } from '@electron/services/workspace/workspacePrewarmScheduler'

type WorkspaceIndexPrewarmerOptions = {
  delayMs: number
  logger: Pick<Logger, 'warn'>
  run: () => Promise<unknown>
}

export class WorkspaceIndexPrewarmer {
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: WorkspaceIndexPrewarmerOptions) {}

  schedule(): void {
    if (this.disposed) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(
      () => {
        this.timer = null
        void scheduleWorkspacePrewarm(async () => {
          if (this.disposed) return
          await this.options.run()
        }).catch((error) => {
          if (!this.disposed)
            this.options.logger.warn('workspace index precompute failed', { error })
        })
      },
      Math.max(0, this.options.delayMs),
    )
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
