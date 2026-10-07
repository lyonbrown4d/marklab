import type { Logger } from '@electron/services/logger'
import { scheduleWorkspacePrewarm } from '@electron/services/workspace/workspacePrewarmScheduler'

type WorkspaceAccessPrewarmerOptions = {
  delayMs?: number
  logger: Logger
  prepare: () => Promise<void>
  rootKind: () => string
}

const DEFAULT_PREWARM_DELAY_MS = 75

export class WorkspaceAccessPrewarmer {
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: WorkspaceAccessPrewarmerOptions) {}

  schedule(): void {
    if (this.disposed) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void scheduleWorkspacePrewarm(async () => {
        if (this.disposed) return
        await this.options.prepare()
      }).catch((error) => {
        this.options.logger.warn('workspace access prewarm failed', {
          error,
          rootKind: this.options.rootKind(),
        })
      })
    }, this.options.delayMs ?? DEFAULT_PREWARM_DELAY_MS)
  }

  dispose(): void {
    this.disposed = true
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
