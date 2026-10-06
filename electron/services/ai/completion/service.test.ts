import { describe, expect, it, vi } from 'vitest'

import { AiInlineCompletionService } from '@electron/services/ai/completion/service'
import type { AiInlineCompletionPolicyContract } from '@electron/services/ai/completion/policy'
import type { AiServiceContract } from '@electron/services/ai/types'

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
    policy: allowPolicy,
    requestIdFactory: () => `request-${++id}`,
    schedule: (task) => task(),
    ...overrides,
  })
}
