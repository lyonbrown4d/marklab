import type { Logger } from '@electron/services/logger'

type GraphPrecomputeStatus = 'error' | 'idle' | 'running'

type GraphPrecomputeRunContext = {
  markStarted: () => void
  signal: AbortSignal
}

type WorkspaceGraphPrecomputeOptions = {
  delayMs: number
  logger: Pick<Logger, 'warn'>
  run: (context: GraphPrecomputeRunContext) => Promise<void>
  setStatus: (status: GraphPrecomputeStatus, message: string | null) => void
}

export class WorkspaceGraphPrecomputeCoordinator {
  private active: {
    cancelled: boolean
    controller: AbortController
    started: boolean
  } | null = null
  private disposed = false
  private generation = 0
  private pending: ReturnType<typeof setTimeout> | null = null
  private queued = 0
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
    this.queued += 1
    this.tail = this.tail.then(async () => {
      this.queued -= 1
      if (!this.isCurrent(generation)) {
        this.setIdleWhenSettled()
        return
      }
      const active = {
        cancelled: false,
        controller: new AbortController(),
        started: false,
      }
      this.active = active
      this.options.setStatus('running', null)
      let failed = false
      try {
        await this.options.run({
          markStarted: () => {
            active.started = true
          },
          signal: active.controller.signal,
        })
      } catch (error) {
        if (active.cancelled || isAbortError(error)) return
        if (!this.isCurrent(generation)) return
        failed = true
        this.options.logger.warn('workspace graph precompute failed', { error })
        this.options.setStatus('error', error instanceof Error ? error.message : String(error))
      } finally {
        if (this.active === active) this.active = null
        if (!failed) this.setIdleWhenSettled()
      }
    })
  }

  private setIdleWhenSettled(): void {
    if (!this.disposed && !this.active && !this.pending && this.queued === 0) {
      this.options.setStatus('idle', null)
    }
  }

  private invalidatePending(): number {
    this.generation += 1
    if (this.pending) clearTimeout(this.pending)
    this.pending = null
    if (this.active) {
      this.active.cancelled = true
      if (!this.active.started) this.active.controller.abort()
    }
    return this.generation
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation
  }
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'
