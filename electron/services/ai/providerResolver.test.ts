import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VercelAiProviderResolver } from '@electron/services/ai/providerResolver'
import type { StoredAiProvider } from '@electron/services/ai/types'

const sdkFactories = vi.hoisted(() => {
  const factory = (provider: string) =>
    vi.fn(() => (model: string) => ({ modelId: model, provider }))
  return {
    anthropic: factory('anthropic'),
    compatible: vi.fn((options: { name: string }) => (model: string) => ({
      modelId: model,
      provider: options.name,
    })),
    google: factory('google'),
    openai: factory('openai'),
  }
})

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: sdkFactories.anthropic }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: sdkFactories.google }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: sdkFactories.openai }))
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: sdkFactories.compatible,
}))

describe('VercelAiProviderResolver', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['openai', 'gpt-5-mini', undefined],
    ['anthropic', 'claude-sonnet-4-6', undefined],
    ['google', 'gemini-3-flash-preview', undefined],
    ['openai-compatible', 'qwen3', 'http://127.0.0.1:11434/v1'],
  ] as const)('creates an AI SDK model for %s', (kind, model, baseUrl) => {
    const provider: StoredAiProvider = {
      id: `${kind}-main`,
      label: kind,
      kind,
      model,
      ...(baseUrl ? { baseUrl } : {}),
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }

    const resolved = new VercelAiProviderResolver().resolve(provider, 'not-a-real-key')

    const modelMetadata = resolved as { modelId: string; provider: string }
    expect(modelMetadata.modelId).toBe(model)
    expect(modelMetadata.provider).toContain(kind === 'openai-compatible' ? provider.id : kind)
    if (kind === 'openai-compatible') {
      expect(sdkFactories.compatible).toHaveBeenCalledWith({
        apiKey: 'not-a-real-key',
        baseURL: baseUrl,
        name: provider.id,
      })
    }
  })

  it.each([
    ['openai', sdkFactories.openai],
    ['anthropic', sdkFactories.anthropic],
    ['google', sdkFactories.google],
  ] as const)('never forwards a custom base URL to the built-in %s SDK', (kind, factory) => {
    const provider: StoredAiProvider = {
      id: `${kind}-main`,
      label: kind,
      kind,
      model: 'model',
      baseUrl: 'https://attacker.example/v1',
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }

    new VercelAiProviderResolver().resolve(provider, 'secret')

    expect(factory).toHaveBeenCalledWith({ apiKey: 'secret' })
  })
})
