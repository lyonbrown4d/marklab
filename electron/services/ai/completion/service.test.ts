import { describe, expect, it, vi } from 'vitest'

import { AiInlineCompletionService } from '@electron/services/ai/completion/service.js'
import type { AiInlineCompletionPolicyContract } from '@electron/services/ai/completion/policy.js'
import type { LocalAiServiceContract } from '@electron/services/ai/local/types.js'
import type { AiServiceContract } from '@electron/services/ai/types.js'

const request = (session: string, providerId = 'openai-main') => ({
  providerId,
  completionSessionId: session,
  revision: 1,
  prefix: 'I plan to',
  suffix: '',
  language: 'en' as const,
  length: 'short' as const,
  excludedSuggestions: [],
})

describe('AiInlineCompletionService', () => {
  it('cancels the previous request for the same owner session', async () => {
    const controllers: AbortSignal[] = []
    const aiService = {
      generateText: vi.fn((_input: unknown, signal?: AbortSignal) => {
        if (signal) controllers.push(signal)
        return new Promise(() => undefined)
      }),
    } as unknown as AiServiceContract
    const service = createService(aiService)
    const emit = vi.fn()

    const first = await service.start(7, request('editor-1'), emit)
    await vi.waitFor(() => expect(controllers).toHaveLength(1))
    const second = await service.start(7, { ...request('editor-1'), revision: 2 }, emit)

    expect(first.requestId).not.toBe(second.requestId)
    expect(controllers[0]?.aborted).toBe(true)
    expect(emit).toHaveBeenCalledWith({ requestId: first.requestId, type: 'cancelled' })
  })

  it('keeps matching session identifiers isolated across renderer windows', async () => {
    const controllers: AbortSignal[] = []
    const aiService = {
      generateText: vi.fn((_input: unknown, signal?: AbortSignal) => {
        if (signal) controllers.push(signal)
        return new Promise(() => undefined)
      }),
    } as unknown as AiServiceContract
    const service = createService(aiService)

    await service.start(7, request('editor-1'), vi.fn())
    await service.start(8, request('editor-1'), vi.fn())
    await vi.waitFor(() => expect(controllers).toHaveLength(2))

    expect(controllers.every((signal) => !signal.aborted)).toBe(true)
  })

  it('aggregates and sanitizes local-model deltas before exposing one candidate', async () => {
    let emitLocal:
      | ((event: Parameters<Parameters<LocalAiServiceContract['startGeneration']>[2]>[0]) => void)
      | undefined
    const localAiService = {
      startGeneration: vi.fn(async (_ownerId, _input, emit) => {
        emitLocal = emit
        return { requestId: '00000000-0000-4000-8000-000000000001' }
      }),
      cancelGeneration: vi.fn(async () => ({ ok: true as const })),
    } as unknown as LocalAiServiceContract
    const service = new AiInlineCompletionService({
      aiService: {} as AiServiceContract,
      localAiService,
      policy: allowPolicy,
    })
    const emit = vi.fn()
    const started = await service.start(7, request('editor-1', 'marklab-local'), emit)

    emitLocal?.({ requestId: started.requestId, type: 'delta', delta: '```text\n"I plan to' })
    emitLocal?.({ requestId: started.requestId, type: 'delta', delta: ' write"\n```' })
    emitLocal?.({
      requestId: started.requestId,
      type: 'finish',
      finishReason: 'stop',
      usage: {},
      warnings: [],
    })

    expect(emit).toHaveBeenNthCalledWith(1, {
      requestId: started.requestId,
      type: 'delta',
      delta: ' write',
    })
    expect(emit).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'finish' }))
  })

  it('keeps only the latest of three delayed local starts for one session', async () => {
    const starts: Array<{
      emit: Parameters<LocalAiServiceContract['startGeneration']>[2]
      resolve: (value: { requestId: string }) => void
    }> = []
    const localAiService = {
      startGeneration: vi.fn(
        (_ownerId, _input, emit: Parameters<LocalAiServiceContract['startGeneration']>[2]) =>
          new Promise<{ requestId: string }>((resolve) => starts.push({ emit, resolve })),
      ),
      cancelGeneration: vi.fn(async () => ({ ok: true as const })),
    } as unknown as LocalAiServiceContract
    const service = createService({} as AiServiceContract, { localAiService })
    const events = [vi.fn(), vi.fn(), vi.fn()]

    const pending: Array<Promise<unknown>> = []
    for (const [index, revision] of [1, 2, 3].entries()) {
      pending.push(
        service
          .start(7, { ...request('editor-1', 'marklab-local'), revision }, events[index]!)
          .catch((error: unknown) => error),
      )
      await vi.waitFor(() => expect(starts).toHaveLength(index + 1))
    }
    starts[2]!.resolve({ requestId: '00000000-0000-4000-8000-000000000003' })
    starts[0]!.resolve({ requestId: '00000000-0000-4000-8000-000000000001' })
    starts[1]!.resolve({ requestId: '00000000-0000-4000-8000-000000000002' })
    await Promise.all(pending)

    for (const [index, start] of starts.entries()) {
      const requestId = `00000000-0000-4000-8000-00000000000${index + 1}`
      start.emit({ requestId, type: 'delta', delta: `candidate-${index}` })
      start.emit({ requestId, type: 'finish', finishReason: 'stop', usage: {}, warnings: [] })
    }
    expect(events[0]).not.toHaveBeenCalled()
    expect(events[1]).not.toHaveBeenCalled()
    expect(events[2]).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delta', delta: 'candidate-2' }),
    )
    expect(localAiService.cancelGeneration).toHaveBeenCalledTimes(2)
  })

  it('bounds pending and active work per owner and globally, then releases capacity', async () => {
    const aiService = {
      generateText: vi.fn(() => new Promise(() => undefined)),
    } as unknown as AiServiceContract
    const service = createService(aiService, { maxGlobalJobs: 2, maxOwnerJobs: 1 })

    const first = await service.start(1, request('one'), vi.fn())
    await expect(service.start(1, request('two'), vi.fn())).rejects.toThrow(/owner.*full/i)
    await service.start(2, request('one'), vi.fn())
    await expect(service.start(3, request('one'), vi.fn())).rejects.toThrow(/queue.*full/i)

    await service.cancelGeneration(1, first.requestId)
    await expect(service.start(3, request('one'), vi.fn())).resolves.toEqual({
      requestId: expect.any(String),
    })
  })

  it('releases capacity after a generation finishes', async () => {
    let finish:
      ((value: Awaited<ReturnType<AiServiceContract['generateText']>>) => void) | undefined
    const aiService = {
      generateText: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<AiServiceContract['generateText']>>>((resolve) => {
            finish = resolve
          }),
      ),
    } as unknown as AiServiceContract
    const service = createService(aiService, { maxGlobalJobs: 1 })

    await service.start(1, request('one'), vi.fn())
    await expect(service.start(2, request('one'), vi.fn())).rejects.toThrow(/queue.*full/i)
    finish?.({ text: ' write', finishReason: 'stop', usage: {}, warnings: [] })
    await vi.waitFor(() => expect(aiService.generateText).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    await expect(service.start(2, request('one'), vi.fn())).resolves.toEqual({
      requestId: expect.any(String),
    })
  })
})

const allowPolicy: AiInlineCompletionPolicyContract = {
  assertProviderAllowed: vi.fn(async () => undefined),
}

const createService = (
  aiService: AiServiceContract,
  overrides: Partial<ConstructorParameters<typeof AiInlineCompletionService>[0]> = {},
) => {
  let id = 0
  return new AiInlineCompletionService({
    aiService,
    localAiService: {} as LocalAiServiceContract,
    policy: allowPolicy,
    requestIdFactory: () => `request-${++id}`,
    schedule: (task) => task(),
    ...overrides,
  })
}
