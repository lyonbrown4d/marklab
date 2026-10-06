import { describe, expect, it, vi } from 'vitest'

import { createService, storedProvider } from '@electron/services/ai/aiServiceTestFixture'

describe('AiService', () => {
  it('returns only masked credential state to the renderer', async () => {
    const { service } = createService()

    await expect(service.listProviders()).resolves.toEqual([
      expect.objectContaining({
        id: 'openai-main',
        locality: 'remote',
        available: true,
        requiresApiKey: true,
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

  it('reports a keyless remote compatible provider as unavailable without exposing credentials', async () => {
    const { service, store } = createService({
      id: 'remote-compatible',
      kind: 'openai-compatible',
      baseUrl: 'https://models.example.com/v1',
      encryptedApiKey: undefined,
    })
    vi.mocked(store.resolveApiKey).mockResolvedValue(null)

    const provider = await service.getProvider('remote-compatible')

    expect(provider).toMatchObject({
      locality: 'remote',
      available: false,
      requiresApiKey: true,
      hasApiKey: false,
      apiKeySource: 'none',
      maskedApiKey: null,
    })
    expect(provider).not.toHaveProperty('apiKey')
    expect(provider).not.toHaveProperty('encryptedApiKey')
    expect(JSON.stringify(provider)).not.toContain('stored-secret')
  })

  it('ignores injected global environment credentials for compatible providers', async () => {
    const { service, store } = createService(
      {
        id: 'remote-compatible',
        kind: 'openai-compatible',
        baseUrl: 'https://models.example.com/v1',
        encryptedApiKey: undefined,
      },
      undefined,
      { 'openai-compatible': 'global-compatible-secret' },
    )
    vi.mocked(store.resolveApiKey).mockResolvedValue(null)

    await expect(service.getProvider('remote-compatible')).resolves.toMatchObject({
      available: false,
      apiKeySource: 'none',
    })
    await expect(
      service.generateText({ providerId: 'remote-compatible', prompt: 'Hi' }),
    ).rejects.toThrow('AI provider API key is not configured')
  })

  it.each(['http://127.0.0.1:11434/v1', 'http://localhost:11434/v1', 'http://[::1]:11434/v1'])(
    'allows a keyless loopback compatible provider at %s',
    async (baseUrl) => {
      const { generate, resolver, service, store } = createService({
        id: 'ollama',
        kind: 'openai-compatible',
        baseUrl,
        encryptedApiKey: undefined,
      })
      vi.mocked(store.resolveApiKey).mockResolvedValue(null)
      vi.mocked(generate).mockResolvedValue({
        text: 'Hello',
        finishReason: 'stop',
        usage: {},
        warnings: [],
      })

      await expect(
        service.generateText({ providerId: 'ollama', prompt: 'Hi' }),
      ).resolves.toMatchObject({ text: 'Hello' })
      expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ baseUrl }), 'ollama')
    },
  )

  it.each(['http://127.42.3.9:11434/v1', 'https://localhost:11434/v1', 'https://[::1]:11434/v1'])(
    'allows every HTTP(S) loopback compatible provider without a key at %s',
    async (baseUrl) => {
      const { generate, service, store } = createService({
        id: 'compatible',
        kind: 'openai-compatible',
        baseUrl,
        encryptedApiKey: undefined,
      })
      vi.mocked(store.resolveApiKey).mockResolvedValue(null)
      vi.mocked(generate).mockResolvedValue({
        text: 'Hello',
        finishReason: 'stop',
        usage: {},
        warnings: [],
      })

      await expect(service.getProvider('compatible')).resolves.toMatchObject({
        locality: 'local',
        available: true,
        requiresApiKey: false,
      })
      await expect(
        service.generateText({ providerId: 'compatible', prompt: 'Hi' }),
      ).resolves.toMatchObject({ text: 'Hello' })
    },
  )

  it.each(['https://example.com/v1'])(
    'requires a real key for compatible provider at %s',
    async (baseUrl) => {
      const { service, store } = createService({
        id: 'compatible',
        kind: 'openai-compatible',
        baseUrl,
        encryptedApiKey: undefined,
      })
      vi.mocked(store.resolveApiKey).mockResolvedValue(null)

      await expect(
        service.generateText({ providerId: 'compatible', prompt: 'Hi' }),
      ).rejects.toThrow('AI provider API key is not configured')
    },
  )
})
