import type { LanguageModel } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { storedProvider } from '@electron/services/ai/aiServiceTestFixture'

const sdkResult = {
  text: 'generated',
  finishReason: 'stop',
  usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
  warnings: [{ type: 'other' }],
}

beforeEach(() => vi.resetModules())
afterEach(() => {
  for (const name of [
    'ai',
    '@ai-sdk/openai',
    '@ai-sdk/anthropic',
    '@ai-sdk/google',
    '@ai-sdk/openai-compatible',
  ]) {
    vi.doUnmock(name)
  }
})

const createDefaultService = async () => {
  const { AiService } = await import('@electron/services/ai/aiService')
  const { VercelAiProviderResolver } = await import('@electron/services/ai/providerResolver')
  return new AiService({
    resolver: new VercelAiProviderResolver(),
    store: {
      list: async () => [storedProvider],
      get: async () => storedProvider,
      resolveApiKey: async () => 'secret',
      update: async () => storedProvider,
      delete: async () => ({ ok: true }),
    },
  })
}

describe('lazy AI SDK loading', () => {
  it('keeps configuration operations light and loads only the selected provider on generation', async () => {
    const generationLoad = vi.fn(() => ({ generateText: generate }))
    const generate = vi.fn(async () => sdkResult)
    const modelFactory = vi.fn(() => (modelId: string) => ({ modelId }))
    const selectedLoad = vi.fn(() => ({ createOpenAI: modelFactory }))
    const otherLoad = vi.fn(() => {
      throw new Error('Unused provider loaded')
    })
    vi.doMock('ai', generationLoad)
    vi.doMock('@ai-sdk/openai', selectedLoad)
    vi.doMock('@ai-sdk/anthropic', otherLoad)
    vi.doMock('@ai-sdk/google', otherLoad)
    vi.doMock('@ai-sdk/openai-compatible', otherLoad)
    const service = await createDefaultService()

    await service.listProviders()
    await service.getProvider(storedProvider.id)
    await service.deleteProvider(storedProvider.id)
    expect(selectedLoad).not.toHaveBeenCalled()
    expect(generationLoad).not.toHaveBeenCalled()
    await expect(
      service.generateText({ providerId: storedProvider.id, prompt: 'hello' }),
    ).resolves.toMatchObject({ text: 'generated', warnings: ['other'] })
    await service.testProvider(storedProvider.id)
    expect(selectedLoad).toHaveBeenCalledTimes(1)
    expect(generationLoad).toHaveBeenCalledTimes(1)
    expect(otherLoad).not.toHaveBeenCalled()
    expect(modelFactory).toHaveBeenCalledTimes(2)
  })

  it('shares concurrent provider loads without sharing per-request models', async () => {
    const factory = vi.fn(() => (modelId: string) => ({ modelId }))
    const load = vi.fn(() => ({ createOpenAI: factory }))
    vi.doMock('@ai-sdk/openai', load)
    const { getAiProviderAdapter } = await import('@electron/services/ai/providerAdapters')
    const adapter = getAiProviderAdapter('openai')
    const models = await Promise.all([
      adapter.createModel(storedProvider, 'first'),
      adapter.createModel({ ...storedProvider, model: 'second' }, 'second'),
    ])
    expect(load).toHaveBeenCalledTimes(1)
    expect(factory.mock.calls).toEqual([[{ apiKey: 'first' }], [{ apiKey: 'second' }]])
    expect(models).toEqual([{ modelId: storedProvider.model }, { modelId: 'second' }])
  })

  it('retries a failed provider SDK import on the next request', async () => {
    const load = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Transient import failure')
      })
      .mockImplementation(() => ({ createOpenAI: () => () => ({ modelId: 'recovered' }) }))
    vi.doMock('@ai-sdk/openai', load)
    const { getAiProviderAdapter } = await import('@electron/services/ai/providerAdapters')
    const adapter = getAiProviderAdapter('openai')
    await expect(adapter.createModel(storedProvider, 'key')).rejects.toThrow()
    await expect(adapter.createModel(storedProvider, 'key')).resolves.toEqual({
      modelId: 'recovered',
    })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('retries a failed generation SDK import without leaking the original error', async () => {
    const load = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('secret import detail')
      })
      .mockImplementation(() => ({ generateText: async () => sdkResult }))
    vi.doMock('ai', load)
    vi.doMock('@ai-sdk/openai', () => ({ createOpenAI: () => () => ({ modelId: 'test' }) }))
    const service = await createDefaultService()
    const request = { providerId: storedProvider.id, prompt: 'hello' }
    await expect(service.generateText(request)).rejects.toThrow('AI provider request failed')
    await expect(service.generateText(request)).resolves.toMatchObject({ text: 'generated' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not start generation after cancellation while resolving the model', async () => {
    const { AiService } = await import('@electron/services/ai/aiService')
    const generate = vi.fn()
    const controller = new AbortController()
    const service = new AiService({
      generate,
      resolver: {
        resolve: async () => {
          controller.abort()
          return { modelId: 'test' } as LanguageModel
        },
      },
      store: {
        list: async () => [storedProvider],
        get: async () => storedProvider,
        resolveApiKey: async () => 'secret',
        update: async () => storedProvider,
        delete: async () => ({ ok: true }),
      },
    })
    await expect(
      service.generateText({ providerId: storedProvider.id, prompt: 'hello' }, controller.signal),
    ).rejects.toThrow('AI provider request failed')
    expect(generate).not.toHaveBeenCalled()
  })
})
