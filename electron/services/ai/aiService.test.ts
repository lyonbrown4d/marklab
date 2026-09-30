import { describe, expect, it, vi } from 'vitest'
import type { LanguageModel } from 'ai'

import { AiService } from '@electron/services/ai/aiService.js'
import type { AiProviderStoreContract } from '@electron/services/ai/types.js'

const storedProvider = {
  id: 'openai-main',
  label: 'OpenAI',
  kind: 'openai' as const,
  model: 'gpt-5-mini',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  encryptedApiKey: Buffer.from('encrypted').toString('base64'),
}

describe('AiService', () => {
  it('returns only masked credential state to the renderer', async () => {
    const { service } = createService()

    await expect(service.listProviders()).resolves.toEqual([
      expect.objectContaining({
        id: 'openai-main',
        hasApiKey: true,
        apiKeySource: 'stored',
        maskedApiKey: '••••••••',
      }),
    ])
    expect(JSON.stringify(await service.getProvider('openai-main'))).not.toContain('encrypted')
  })

  it('uses environment credentials only as a non-returned fallback', async () => {
    const { service, store } = createService({ encryptedApiKey: undefined }, 'env-secret')
    vi.mocked(store.resolveApiKey).mockResolvedValue(null)

    await expect(service.getProvider('openai-main')).resolves.toMatchObject({
      hasApiKey: true,
      apiKeySource: 'environment',
    })
    expect(JSON.stringify(await service.getProvider('openai-main'))).not.toContain('env-secret')
  })

  it('resolves the selected provider and returns a narrow generation result', async () => {
    const { generate, resolver, service } = createService()
    vi.mocked(generate).mockResolvedValue({
      text: 'Hello',
      finishReason: 'stop',
      usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      warnings: undefined,
    })

    await expect(
      service.generateText({ providerId: 'openai-main', prompt: 'Hi', maxOutputTokens: 32 }),
    ).resolves.toEqual({
      text: 'Hello',
      finishReason: 'stop',
      usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      warnings: [],
    })
    expect(resolver.resolve).toHaveBeenCalledWith(storedProvider, 'stored-secret')
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Hi', maxOutputTokens: 32, maxRetries: 1 }),
    )
  })

  it('applies a bounded default output size when the caller omits one', async () => {
    const { generate, service } = createService()
    vi.mocked(generate).mockResolvedValue({
      text: 'Hello',
      finishReason: 'stop',
      usage: {},
      warnings: [],
    })

    await service.generateText({ providerId: 'openai-main', prompt: 'Hi' })

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 4_096 }))
  })

  it('bounds concurrent and queued generation work', async () => {
    const { generate, service } = createService()
    const completions: Array<() => void> = []
    vi.mocked(generate).mockImplementation(
      () =>
        new Promise((resolve) => {
          completions.push(() =>
            resolve({ text: 'ok', finishReason: 'stop', usage: {}, warnings: [] }),
          )
        }),
    )

    const accepted = Array.from({ length: 8 }, () =>
      service.generateText({ providerId: 'openai-main', prompt: 'Hi' }),
    )
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
    await expect(
      service.generateText({ providerId: 'openai-main', prompt: 'overflow' }),
    ).rejects.toThrow('AI generation queue is full')

    while (completions.length > 0) {
      completions.shift()?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await Promise.all(accepted)
  })

  it('normalizes provider errors without leaking keys or authorization headers', async () => {
    const secret = 'stored-secret'
    const { generate, service } = createService()
    vi.mocked(generate).mockRejectedValue(
      new Error(`Authorization: Bearer ${secret}; x-api-key=${secret}`),
    )

    const request = service.generateText({ providerId: 'openai-main', prompt: 'Hi' })
    await expect(request).rejects.toThrow('AI provider request failed')
    await expect(request).rejects.not.toThrow(secret)
  })

  it('normalizes provider resolver errors without leaking the API key', async () => {
    const secret = 'stored-secret'
    const { resolver, service } = createService()
    vi.mocked(resolver.resolve).mockImplementation(() => {
      throw new Error(`Could not configure Authorization: Bearer ${secret}`)
    })

    const request = service.generateText({ providerId: 'openai-main', prompt: 'Hi' })
    await expect(request).rejects.toThrow('AI provider request failed')
    await expect(request).rejects.not.toThrow(secret)
  })

  it('uses a bounded probe for provider connection tests', async () => {
    const { generate, service } = createService()
    vi.mocked(generate).mockResolvedValue({
      text: 'OK',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    })

    await expect(service.testProvider('openai-main')).resolves.toEqual({ ok: true })
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Reply with OK.', maxOutputTokens: 8, maxRetries: 0 }),
    )
  })

  it('rejects generation when neither stored nor environment credentials exist', async () => {
    const { service, store } = createService({ encryptedApiKey: undefined })
    vi.mocked(store.resolveApiKey).mockResolvedValue(null)

    await expect(service.generateText({ providerId: 'openai-main', prompt: 'Hi' })).rejects.toThrow(
      'AI provider API key is not configured',
    )
  })
})

const createService = (
  providerOverrides: Partial<typeof storedProvider> = {},
  environmentKey: string | undefined = undefined,
) => {
  const provider = { ...storedProvider, ...providerOverrides }
  const store = {
    list: vi.fn(async () => [provider]),
    get: vi.fn(async () => provider),
    update: vi.fn(),
    delete: vi.fn(),
    resolveApiKey: vi.fn(async () => (provider.encryptedApiKey ? 'stored-secret' : null)),
  } satisfies AiProviderStoreContract
  const resolver = { resolve: vi.fn(() => ({ modelId: provider.model }) as LanguageModel) }
  const generate = vi.fn()
  const service = new AiService({
    store,
    resolver,
    generate,
    environment: {
      openai: environmentKey,
      anthropic: undefined,
      google: undefined,
      'openai-compatible': undefined,
    },
  })
  return { generate, resolver, service, store }
}
