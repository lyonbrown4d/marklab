import { describe, expect, it } from 'vitest'

import { VercelAiProviderResolver } from '@electron/services/ai/providerResolver.js'
import type { StoredAiProvider } from '@electron/services/ai/types.js'

describe('VercelAiProviderResolver', () => {
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

    expect(resolved.modelId).toBe(model)
    expect(resolved.provider).toContain(kind === 'openai-compatible' ? provider.id : kind)
  })
})
