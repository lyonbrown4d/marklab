import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@/runtime/ipc'
import type { RuntimeEvent } from '@/runtime/events'
import { aiApi } from '@/services/aiApi'

// Native responses stay unknown so malformed-payload cases exercise runtime validation.
const nativeIpc = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/runtime/ipc', () => nativeIpc)
const nativeEvents = vi.hoisted(() => ({
  listen:
    vi.fn<(name: string, handler: (event: RuntimeEvent<unknown>) => void) => Promise<() => void>>(),
}))
vi.mock('@/runtime/events', () => nativeEvents)

const publicProvider = {
  id: 'openai-main',
  label: 'OpenAI',
  kind: 'openai',
  model: 'gpt-5-mini',
  locality: 'remote',
  available: true,
  requiresApiKey: true,
  hasApiKey: true,
  apiKeySource: 'stored',
  maskedApiKey: '••••••••',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
}

describe('aiApi', () => {
  beforeEach(() => {
    nativeIpc.invoke.mockReset()
    nativeEvents.listen.mockReset()
  })

  it('validates public provider responses and never models a plaintext key', async () => {
    nativeIpc.invoke.mockResolvedValue([publicProvider])

    await expect(aiApi.listProviders()).resolves.toEqual([publicProvider])
    expect(invoke).toHaveBeenCalledWith('ai_list_providers')
  })

  it('sends bounded generation requests and validates the result', async () => {
    nativeIpc.invoke.mockResolvedValue({
      text: 'Hello',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    })
    const request = {
      providerId: 'openai-main',
      prompt: 'Hi',
      maxOutputTokens: 16,
      system: null,
      temperature: null,
    }

    await expect(aiApi.generateText(request)).resolves.toMatchObject({ text: 'Hello' })
    expect(invoke).toHaveBeenCalledWith('ai_generate_text', request)
  })

  it('rejects native responses that attempt to expose a plaintext API key', async () => {
    nativeIpc.invoke.mockResolvedValue([{ ...publicProvider, apiKey: 'leaked-secret' }])
    await expect(aiApi.listProviders()).rejects.toThrow()
  })

  it('starts and cancels a validated streaming generation', async () => {
    nativeIpc.invoke
      .mockResolvedValueOnce({ requestId: 'request-1' })
      .mockResolvedValueOnce({ ok: true })

    await expect(
      aiApi.startGeneration({ providerId: 'openai-main', prompt: 'Rewrite this' }),
    ).resolves.toEqual({ requestId: 'request-1' })
    await expect(aiApi.cancelGeneration('request-1')).resolves.toBeUndefined()

    expect(invoke).toHaveBeenNthCalledWith(1, 'ai_start_generation', {
      providerId: 'openai-main',
      prompt: 'Rewrite this',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'ai_cancel_generation', {
      requestId: 'request-1',
    })
  })

  it('validates every generation event before delivering it', async () => {
    const unlisten = vi.fn()
    nativeEvents.listen.mockResolvedValue(unlisten)
    const handler = vi.fn()

    await expect(aiApi.onGenerationEvent(handler)).resolves.toBe(unlisten)
    const runtimeHandler = nativeEvents.listen.mock.calls[0]?.[1]
    runtimeHandler?.({
      event: 'ai-generation-event',
      id: 1,
      payload: { requestId: 'request-1', type: 'delta', delta: 'Hello' },
    })

    expect(handler).toHaveBeenCalledWith({
      requestId: 'request-1',
      type: 'delta',
      delta: 'Hello',
    })
    expect(() =>
      runtimeHandler?.({
        event: 'ai-generation-event',
        id: 2,
        payload: { requestId: 'request-1', type: 'delta', html: '<script />' },
      }),
    ).toThrow()
  })
})
