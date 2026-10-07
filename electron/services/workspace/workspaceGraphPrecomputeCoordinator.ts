import type { Logger } from '@electron/services/logger'

type GraphPrecomputeStatus = 'error' | 'idle' | 'running'

type WorkspaceGraphPrecomputeOptions = {
  delayMs: number
  logger: Pick<Logger, 'warn'>
  run: () => Promise<void>
  setStatus: (status: GraphPrecomputeStatus, message: string | null) => void
}

export class WorkspaceGraphPrecomputeCoordinator {
  private disposed = false
  private generation = 0
  private pending: ReturnType<typeof setTimeout> | null = null
  private tail = Promise.resolve()

  constructor(private readonly options: WorkspaceGraphPrecomputeOptions) {}

  schedule(): void {
    if (this.disposed) return
    const generation = this.invalidatePending()
    this.pending = setTimeout(
      () => {
        this.pending = null
        this.enqueue(generation)
      },
      Math.max(0, this.options.delayMs),
    )
  }

  cancel(): void {
    this.invalidatePending()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.invalidatePending()
  }

  private enqueue(generation: number): void {
    this.tail = this.tail.then(async () => {
      if (!this.isCurrent(generation)) return
      this.options.setStatus('running', null)
      try {
        await this.options.run()
        if (this.isCurrent(generation)) this.options.setStatus('idle', null)
      } catch (error) {
        if (!this.isCurrent(generation)) return
        this.options.logger.warn('workspace graph precompute failed', { error })
        this.options.setStatus('error', error instanceof Error ? error.message : String(error))
      }
    })
  }

  private invalidatePending(): number {
    this.generation += 1
    if (this.pending) clearTimeout(this.pending)
    this.pending = null
    return this.generation
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation
  }
}
