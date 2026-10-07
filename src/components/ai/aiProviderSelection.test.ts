import { describe, expect, it } from 'vitest'
import { resolveInlineAiProvider } from '@/components/ai/aiProviderSelection'

const provider = {
  id: 'remote',
  label: 'Remote',
  kind: 'openai' as const,
  model: 'model-a',
  locality: 'remote' as const,
  available: true,
  requiresApiKey: true,
  hasApiKey: true,
  apiKeySource: 'stored' as const,
  maskedApiKey: '••••••••' as const,
  createdAt: '',
  updatedAt: '',
}

describe('resolveInlineAiProvider', () => {
  it('selects an explicit loopback Ollama default without requiring a key', () => {
    expect(
      resolveInlineAiProvider('ollama', [
        provider,
        {
          ...provider,
          id: 'ollama',
          label: 'Ollama',
          kind: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:11434/v1',
          locality: 'local',
          available: true,
          requiresApiKey: false,
          hasApiKey: false,
        },
      ]),
    ).toEqual({ id: 'ollama', label: 'Ollama · model-a', locality: 'local' })
  })

  it('does not fall back when an explicit default is unavailable', () => {
    expect(resolveInlineAiProvider('missing', [provider])).toBeNull()
    expect(
      resolveInlineAiProvider('remote', [{ ...provider, available: false, hasApiKey: false }]),
    ).toBeNull()
    expect(
      resolveInlineAiProvider('secure-loopback', [
        {
          ...provider,
          id: 'secure-loopback',
          kind: 'openai-compatible',
          baseUrl: 'https://localhost:11434/v1',
          locality: 'local',
          available: true,
          requiresApiKey: false,
          hasApiKey: false,
        },
      ]),
    ).toEqual({ id: 'secure-loopback', label: 'Remote · model-a', locality: 'local' })
  })

  it('automatically selects only when there is no explicit default', () => {
    expect(resolveInlineAiProvider(null, [provider])).toEqual({
      id: 'remote',
      label: 'Remote · model-a',
      locality: 'remote',
    })
    expect(resolveInlineAiProvider(null, [])).toBeNull()
  })
})
