import { describe, expect, it } from 'vitest'

import { readAiEnvironment } from '@electron/services/ai/environment'
import { getAiProviderAdapter } from '@electron/services/ai/providerAdapters'
import { AI_PROVIDER_KINDS, getAiProviderPolicy } from '@electron/services/ai/providerCatalog'

describe('AI provider adapter registry', () => {
  it('registers every supported provider with its environment credential source', () => {
    expect(AI_PROVIDER_KINDS.map((kind) => getAiProviderAdapter(kind).kind)).toEqual(
      AI_PROVIDER_KINDS,
    )
    expect(
      Object.fromEntries(
        AI_PROVIDER_KINDS.map((kind) => [kind, getAiProviderPolicy(kind).environmentVariable]),
      ),
    ).toEqual({
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_GENERATIVE_AI_API_KEY',
      'openai-compatible': undefined,
    })
  })

  it('does not expose a global credential fallback for compatible providers', () => {
    expect(
      readAiEnvironment({ MARKLAB_OPENAI_COMPATIBLE_API_KEY: 'must-not-be-used' })[
        'openai-compatible'
      ],
    ).toBeUndefined()
  })

  it('exposes immutable provider policies', () => {
    expect(Object.isFrozen(AI_PROVIDER_KINDS)).toBe(true)
    expect(Object.isFrozen(getAiProviderPolicy('openai'))).toBe(true)
    expect(Object.isFrozen(getAiProviderPolicy('openai-compatible'))).toBe(true)
    expect(Object.isFrozen(getAiProviderAdapter('openai'))).toBe(true)
  })

  it.each(['http://localhost:11434/v1', 'https://127.99.8.7:11434/v1', 'http://[::1]:11434/v1'])(
    'classifies HTTP(S) loopback compatible endpoint %s as local and key-optional',
    (baseUrl) => {
      const adapter = getAiProviderPolicy('openai-compatible')
      const provider = { id: 'local', kind: 'openai-compatible' as const, model: 'qwen3', baseUrl }

      expect(adapter.getLocality(provider)).toBe('local')
      expect(adapter.requiresApiKey(provider)).toBe(false)
      expect(adapter.resolveApiKey(provider, undefined)).toBe('ollama')
    },
  )

  it('keeps HTTPS non-loopback compatible endpoints remote and credential-required', () => {
    const adapter = getAiProviderPolicy('openai-compatible')
    const provider = {
      id: 'remote',
      kind: 'openai-compatible' as const,
      model: 'model',
      baseUrl: 'https://models.example.com/v1',
    }

    expect(adapter.getLocality(provider)).toBe('remote')
    expect(adapter.requiresApiKey(provider)).toBe(true)
    expect(adapter.resolveApiKey(provider, undefined)).toBeUndefined()
  })
})
