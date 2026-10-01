import { randomUUID } from 'node:crypto'

import {
  localAiDirectoryConfigSchema,
  localAiGenerationInputSchema,
} from '@electron/services/ai/local/schemas.js'
import type {
  LocalAiDirectoryConfig,
  LocalAiDirectoryProgressHandler,
  LocalAiEventHandler,
  LocalAiGenerationEvent,
  LocalAiModelManagerContract,
  LocalAiProgressHandler,
  LocalAiRuntimeContract,
  LocalAiServiceContract,
  LocalAiStatus,
} from '@electron/services/ai/local/types.js'

type LocalAiServiceOptions = {
  modelManager: LocalAiModelManagerContract
  runtime: LocalAiRuntimeContract
  requestIdFactory?: () => string
  maxQueuedGenerations?: number
  persistModelDirectory?: (config: LocalAiDirectoryConfig) => Promise<void> | void
  persistMigration?: (migration: import('./types.js').LocalAiDirectoryMigration) => void
  switchDrainTimeoutMs?: number
}

type GenerationJob = {
  cancelled: boolean
  emit: LocalAiEventHandler
  input: ReturnType<typeof localAiGenerationInputSchema.parse>
  ownerId: number
  requestId: string
}

const DEFAULT_MAX_GENERATION_JOBS = 4

export class LocalAiService implements LocalAiServiceContract {
  private readonly jobs = new Map<string, GenerationJob>()
  private readonly queue: string[] = []
  private activeRequestId: string | null = null
  private pumpScheduled = false
  private directorySwitching = false
  private readonly generationIdleWaiters: Array<() => void> = []
  private readonly requestIdFactory: () => string
  private readonly maxQueuedGenerations: number

  constructor(private readonly options: LocalAiServiceOptions) {
    this.requestIdFactory = options.requestIdFactory ?? randomUUID
    this.maxQueuedGenerations = options.maxQueuedGenerations ?? DEFAULT_MAX_GENERATION_JOBS
  }

  async status(): Promise<LocalAiStatus> {
    const models = await this.options.modelManager.status()
    const error = this.options.runtime.getError()
    return {
      ...models,
      runtime: this.options.runtime.getStatus(),
      ...(error ? { error } : {}),
    }
  }

  download(modelId: string, onProgress: LocalAiProgressHandler): Promise<{ taskId: string }> {
    return this.options.modelManager.download(modelId, onProgress)
  }

  cancelDownload(taskId: string): Promise<{ ok: true }> {
    return this.options.modelManager.cancelDownload(taskId)
  }

  async deleteModel(modelId: string): Promise<{ ok: true }> {
    this.assertNoMigration()
    await this.options.runtime.dispose()
    return this.options.modelManager.deleteModel(modelId)
  }

  async setActiveModel(modelId: string): Promise<{ ok: true }> {
    this.assertNoMigration()
    await this.options.runtime.dispose()
    return this.options.modelManager.setActiveModel(modelId)
  }

  async setModelDirectory(
    input: LocalAiDirectoryConfig,
    onProgress: LocalAiDirectoryProgressHandler = () => undefined,
  ): Promise<LocalAiStatus> {
    const config = localAiDirectoryConfigSchema.parse(input)
    const task = this.options.modelManager.startModelDirectoryMigration(config, {
      beforeSwitch: async () => {
        this.directorySwitching = true
        await this.waitForGenerationIdle()
        await this.options.runtime.dispose()
      },
      onProgress: (migration) => {
        this.options.persistMigration?.(migration)
        onProgress(migration)
      },
      persist: async (preference) => this.options.persistModelDirectory?.(preference),
    })
    void task.finally(() => {
      this.directorySwitching = false
    })
    return this.status()
  }

  async startGeneration(
    ownerId: number,
    input: unknown,
    emit: LocalAiEventHandler,
  ): Promise<{ requestId: string }> {
    const parsed = localAiGenerationInputSchema.parse(input)
    if (this.directorySwitching || this.options.modelManager.isMigrationActive()) {
      throw new Error('Local AI runtime is busy')
    }
    if (this.jobs.size >= this.maxQueuedGenerations)
      throw new Error('Local AI generation queue is full')
    const requestId = this.requestIdFactory()
    this.jobs.set(requestId, { cancelled: false, emit, input: parsed, ownerId, requestId })
    this.queue.push(requestId)
    this.schedulePump()
    return { requestId }
  }

  async cancelGeneration(ownerId: number, requestId: string): Promise<{ ok: true }> {
    const job = this.jobs.get(requestId)
    if (!job || job.ownerId !== ownerId) return { ok: true }
    job.cancelled = true
    this.removeQueued(requestId)
    this.emitTerminal(job, { requestId, type: 'cancelled' })
    await this.options.runtime.cancel(requestId)
    return { ok: true }
  }

  async cancelOwner(ownerId: number): Promise<void> {
    const ownedIds = [...this.jobs.values()]
      .filter((job) => job.ownerId === ownerId)
      .map((job) => job.requestId)
    await Promise.all(ownedIds.map((requestId) => this.cancelGeneration(ownerId, requestId)))
  }

  async dispose(): Promise<void> {
    const jobs = [...this.jobs.values()]
    jobs.forEach((job) => this.emitTerminal(job, { requestId: job.requestId, type: 'cancelled' }))
    this.queue.length = 0
    this.notifyGenerationIdle()
    await this.options.runtime.dispose()
  }

  private schedulePump(): void {
    if (this.pumpScheduled || this.activeRequestId) return
    this.pumpScheduled = true
    setImmediate(() => {
      this.pumpScheduled = false
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.activeRequestId) return
    const requestId = this.queue.shift()
    if (!requestId) return
    const job = this.jobs.get(requestId)
    if (!job) {
      this.schedulePump()
      return
    }
    this.activeRequestId = requestId
    try {
      if (this.isCancelled(job)) return
      const modelStatus = await this.options.modelManager.status()
      if (this.isCancelled(job)) return
      if (!modelStatus.activeModelId) throw new Error('No active local AI model is installed')
      const modelPath = await this.options.modelManager.modelPath(modelStatus.activeModelId)
      if (this.isCancelled(job)) return
      await this.options.runtime.generate(
        {
          requestId,
          modelPath,
          prompt: job.input.prompt,
          ...(job.input.system === undefined ? {} : { system: job.input.system }),
          ...(job.input.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: job.input.maxOutputTokens }),
          ...(job.input.temperature === undefined ? {} : { temperature: job.input.temperature }),
        },
        (event) => {
          if (this.jobs.has(requestId)) job.emit(event)
          if (isTerminal(event)) this.jobs.delete(requestId)
        },
      )
    } catch (error) {
      if (this.jobs.has(requestId)) {
        this.emitTerminal(job, {
          requestId,
          type: 'error',
          message: normalizeGenerationError(error),
        })
      }
    } finally {
      this.jobs.delete(requestId)
      this.activeRequestId = null
      this.notifyGenerationIdle()
      this.schedulePump()
    }
  }

  private removeQueued(requestId: string): void {
    const index = this.queue.indexOf(requestId)
    if (index >= 0) this.queue.splice(index, 1)
  }

  private isCancelled(job: GenerationJob): boolean {
    return job.cancelled || !this.jobs.has(job.requestId)
  }

  private emitTerminal(job: GenerationJob, event: LocalAiGenerationEvent): void {
    this.jobs.delete(job.requestId)
    job.emit(event)
    this.notifyGenerationIdle()
  }

  private waitForGenerationIdle(): Promise<void> {
    if (this.jobs.size === 0 && this.activeRequestId === null) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timeout)
        resolve()
      }
      const timeout = setTimeout(() => {
        const index = this.generationIdleWaiters.indexOf(waiter)
        if (index >= 0) this.generationIdleWaiters.splice(index, 1)
        reject(new Error('Timed out waiting for local AI generation to stop'))
      }, this.options.switchDrainTimeoutMs ?? 120_000)
      timeout.unref?.()
      this.generationIdleWaiters.push(waiter)
    })
  }

  private notifyGenerationIdle(): void {
    if (this.jobs.size > 0 || this.activeRequestId !== null) return
    for (const resolve of this.generationIdleWaiters.splice(0)) resolve()
  }

  private assertNoMigration(): void {
    if (this.options.modelManager.isMigrationActive()) {
      throw new Error('Local AI model directory is busy')
    }
  }
}

const isTerminal = (event: LocalAiGenerationEvent): boolean =>
  event.type === 'finish' || event.type === 'error' || event.type === 'cancelled'

const normalizeGenerationError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message.slice(0, 300)
  return 'Local AI generation failed'
}
