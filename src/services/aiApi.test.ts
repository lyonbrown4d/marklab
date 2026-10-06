import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@/runtime/ipc'
import { listen } from '@/runtime/events'
import { aiApi } from '@/services/aiApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn() }))

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
    vi.mocked(invoke).mockReset()
    vi.mocked(listen).mockReset()
  })

  it('validates public provider responses and never models a plaintext key', async () => {
    vi.mocked(invoke).mockResolvedValue([publicProvider])

    await expect(aiApi.listProviders()).resolves.toEqual([publicProvider])
    expect(invoke).toHaveBeenCalledWith('ai_list_providers')
  })

  it('sends bounded generation requests and validates the result', async () => {
    vi.mocked(invoke).mockResolvedValue({
      text: 'Hello',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    })
    const request = { providerId: 'openai-main', prompt: 'Hi', maxOutputTokens: 16 }

    await expect(aiApi.generateText(request)).resolves.toMatchObject({ text: 'Hello' })
    expect(invoke).toHaveBeenCalledWith('ai_generate_text', request)
  })

  it('rejects native responses that attempt to expose a plaintext API key', async () => {
    vi.mocked(invoke).mockResolvedValue([{ ...publicProvider, apiKey: 'leaked-secret' }])
    await expect(aiApi.listProviders()).rejects.toThrow()
  })

  it('starts and cancels a validated streaming generation', async () => {
    vi.mocked(invoke)
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
    vi.mocked(listen).mockResolvedValue(unlisten)
    const handler = vi.fn()

    await expect(aiApi.onGenerationEvent(handler)).resolves.toBe(unlisten)
    const runtimeHandler = vi.mocked(listen).mock.calls[0]?.[1]
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
