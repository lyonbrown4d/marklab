import { randomUUID } from 'node:crypto'

import type { AiInlineCompletionPolicyContract } from '@electron/services/ai/completion/policy'
import { LOCAL_AI_PROVIDER_ID } from '@electron/services/ai/local/types'
import type {
  LocalAiGenerationEvent,
  LocalAiServiceContract,
} from '@electron/services/ai/local/types'
import type { AiServiceContract } from '@electron/services/ai/types'
import {
  buildInlineCompletionGenerationRequest,
  cleanInlineCompletion,
} from '@electron/services/ai/completion/prompt'
import type {
  AiInlineCompletionEventHandler,
  AiInlineCompletionServiceContract,
} from '@electron/services/ai/completion/types'
import {
  aiInlineCompletionRequestSchema,
  type AiInlineCompletionRequest,
} from '@/types/aiCompletion'

type CompletionAttempt = {
  generation: number
  ownerId: number
  released: boolean
  requestId?: string
  sessionKey: string
  slotId: string
}

type CompletionJob = {
  attempt: CompletionAttempt
  controller?: AbortController
  emit: AiInlineCompletionEventHandler
  input: AiInlineCompletionRequest
}

type AiInlineCompletionServiceOptions = {
  aiService: AiServiceContract
  localAiService: LocalAiServiceContract
  policy: AiInlineCompletionPolicyContract
  maxGlobalJobs?: number
  maxOwnerJobs?: number
  requestIdFactory?: () => string
  schedule?: (task: () => void) => void
}

const DEFAULT_MAX_GLOBAL_JOBS = 8
const DEFAULT_MAX_OWNER_JOBS = 3

export class AiInlineCompletionService implements AiInlineCompletionServiceContract {
  private readonly attemptsBySession = new Map<string, CompletionAttempt>()
  private readonly jobs = new Map<string, CompletionJob>()
  private readonly localBuffers = new Map<string, string>()
  private readonly ownerSlotCounts = new Map<number, number>()
  private readonly requestIdFactory: () => string
  private readonly schedule: (task: () => void) => void
  private totalSlots = 0

  constructor(private readonly options: AiInlineCompletionServiceOptions) {
    this.requestIdFactory = options.requestIdFactory ?? randomUUID
    this.schedule = options.schedule ?? ((task) => setImmediate(task))
  }

  async start(
    ownerId: number,
    rawInput: unknown,
    emit: AiInlineCompletionEventHandler,
  ): Promise<{ requestId: string }> {
    const input = aiInlineCompletionRequestSchema.parse(rawInput)
    const sessionKey = `${ownerId}:${input.completionSessionId}`
    const previous = this.attemptsBySession.get(sessionKey)
    const previousCancellation = previous ? this.cancelAttempt(previous, true) : Promise.resolve()
    this.assertCapacity(ownerId)
    const attempt = this.reserveAttempt(ownerId, sessionKey, (previous?.generation ?? 0) + 1)
    this.attemptsBySession.set(sessionKey, attempt)
    try {
      await previousCancellation
      await this.options.policy.assertProviderAllowed(input.providerId)
      this.assertCurrent(attempt)
      if (input.providerId === LOCAL_AI_PROVIDER_ID) {
        return await this.startLocal(attempt, input, emit)
      }
      return this.startCloud(attempt, input, emit)
    } catch (error) {
      this.releaseAttempt(attempt)
      throw error
    }
  }

  async cancelGeneration(ownerId: number, requestId: string): Promise<boolean> {
    const job = this.jobs.get(requestId)
    if (!job || job.attempt.ownerId !== ownerId) return false
    await this.cancelAttempt(job.attempt, true)
    return true
  }

  async cancelOwner(ownerId: number): Promise<void> {
    const owned = [...this.attemptsBySession.values()].filter(
      (attempt) => attempt.ownerId === ownerId,
    )
    await Promise.all(owned.map((attempt) => this.cancelAttempt(attempt, false)))
  }

  private startCloud(
    attempt: CompletionAttempt,
    input: AiInlineCompletionRequest,
    emit: AiInlineCompletionEventHandler,
  ): { requestId: string } {
    const requestId = attempt.slotId
    attempt.requestId = requestId
    const job: CompletionJob = {
      attempt,
      controller: new AbortController(),
      emit,
      input,
    }
    this.jobs.set(requestId, job)
    this.schedule(() => void this.runCloud(job))
    return { requestId }
  }

  private async runCloud(job: CompletionJob): Promise<void> {
    const requestId = job.attempt.requestId!
    try {
      const result = await this.options.aiService.generateText(
        buildInlineCompletionGenerationRequest(job.input),
        job.controller?.signal,
      )
      if (!this.isCurrentJob(job)) return
      const suggestion = cleanInlineCompletion(result.text, job.input)
      if (suggestion) job.emit({ requestId, type: 'delta', delta: suggestion })
      job.emit({
        requestId,
        type: 'finish',
        finishReason: result.finishReason,
        usage: result.usage,
        warnings: result.warnings,
      })
    } catch {
      if (!this.isCurrentJob(job)) return
      job.emit({ requestId, type: 'error', message: 'AI provider request failed' })
    } finally {
      if (this.isCurrentJob(job)) this.releaseAttempt(job.attempt)
    }
  }

  private async startLocal(
    attempt: CompletionAttempt,
    input: AiInlineCompletionRequest,
    emit: AiInlineCompletionEventHandler,
  ): Promise<{ requestId: string }> {
    const pendingEvents: LocalAiGenerationEvent[] = []
    let ready = false
    const handleEvent = (event: LocalAiGenerationEvent) => {
      if (!ready) pendingEvents.push(event)
      else this.handleLocalEvent(event)
    }
    const result = await this.options.localAiService.startGeneration(
      attempt.ownerId,
      { ...buildInlineCompletionGenerationRequest(input), providerId: LOCAL_AI_PROVIDER_ID },
      handleEvent,
    )
    if (!this.isCurrent(attempt)) {
      await this.options.localAiService.cancelGeneration(attempt.ownerId, result.requestId)
      throw new Error('AI inline completion request was superseded')
    }
    attempt.requestId = result.requestId
    this.jobs.set(result.requestId, { attempt, emit, input })
    ready = true
    pendingEvents.forEach((event) => this.handleLocalEvent(event))
    return result
  }

  private handleLocalEvent(event: LocalAiGenerationEvent): void {
    const job = this.jobs.get(event.requestId)
    if (!job || !this.isCurrentJob(job)) return
    if (event.type === 'delta') {
      const current = this.localBuffers.get(event.requestId) ?? ''
      this.localBuffers.set(event.requestId, current + event.delta)
      return
    }
    if (event.type === 'finish') {
      const suggestion = cleanInlineCompletion(
        this.localBuffers.get(event.requestId) ?? '',
        job.input,
      )
      if (suggestion) job.emit({ requestId: event.requestId, type: 'delta', delta: suggestion })
    }
    job.emit(event)
    this.releaseAttempt(job.attempt)
  }

  private reserveAttempt(
    ownerId: number,
    sessionKey: string,
    generation: number,
  ): CompletionAttempt {
    const slotId = this.requestIdFactory()
    this.totalSlots += 1
    this.ownerSlotCounts.set(ownerId, (this.ownerSlotCounts.get(ownerId) ?? 0) + 1)
    return {
      generation,
      ownerId,
      released: false,
      sessionKey,
      slotId,
    }
  }

  private assertCapacity(ownerId: number): void {
    if (this.totalSlots >= (this.options.maxGlobalJobs ?? DEFAULT_MAX_GLOBAL_JOBS)) {
      throw new Error('AI inline completion queue is full')
    }
    if (
      (this.ownerSlotCounts.get(ownerId) ?? 0) >=
      (this.options.maxOwnerJobs ?? DEFAULT_MAX_OWNER_JOBS)
    ) {
      throw new Error('AI inline completion owner queue is full')
    }
  }

  private cancelAttempt(attempt: CompletionAttempt, emitCancelled: boolean): Promise<unknown> {
    const requestId = attempt.requestId
    const job = requestId ? this.jobs.get(requestId) : undefined
    this.releaseAttempt(attempt)
    job?.controller?.abort()
    if (emitCancelled && job && requestId) job.emit({ requestId, type: 'cancelled' })
    if (job && requestId && job.input.providerId === LOCAL_AI_PROVIDER_ID) {
      return this.options.localAiService.cancelGeneration(attempt.ownerId, requestId)
    }
    return Promise.resolve()
  }

  private releaseAttempt(attempt: CompletionAttempt): void {
    if (attempt.released) return
    attempt.released = true
    this.totalSlots -= 1
    const ownerSlots = (this.ownerSlotCounts.get(attempt.ownerId) ?? 1) - 1
    if (ownerSlots > 0) this.ownerSlotCounts.set(attempt.ownerId, ownerSlots)
    else this.ownerSlotCounts.delete(attempt.ownerId)
    if (attempt.requestId) {
      this.jobs.delete(attempt.requestId)
      this.localBuffers.delete(attempt.requestId)
    }
    if (this.attemptsBySession.get(attempt.sessionKey) === attempt) {
      this.attemptsBySession.delete(attempt.sessionKey)
    }
  }

  private assertCurrent(attempt: CompletionAttempt): void {
    if (!this.isCurrent(attempt)) throw new Error('AI inline completion request was superseded')
  }

  private isCurrent(attempt: CompletionAttempt): boolean {
    return !attempt.released && this.attemptsBySession.get(attempt.sessionKey) === attempt
  }

  private isCurrentJob(job: CompletionJob): boolean {
    return Boolean(job.attempt.requestId && this.jobs.get(job.attempt.requestId) === job)
  }
}
