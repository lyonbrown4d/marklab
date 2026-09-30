import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@/runtime/ipc'
import { aiApi } from '@/services/aiApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

const publicProvider = {
  id: 'openai-main',
  label: 'OpenAI',
  kind: 'openai',
  model: 'gpt-5-mini',
  hasApiKey: true,
  apiKeySource: 'stored',
  maskedApiKey: '••••••••',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
}

describe('aiApi', () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

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
})
