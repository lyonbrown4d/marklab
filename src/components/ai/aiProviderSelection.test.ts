import { describe, expect, it } from 'vitest'
import { resolveInlineAiProvider } from '@/components/ai/aiProviderSelection'

const provider = {
  id: 'remote',
  label: 'Remote',
  kind: 'openai' as const,
  model: 'model-a',
  hasApiKey: true,
  apiKeySource: 'stored' as const,
  maskedApiKey: '••••••••' as const,
  createdAt: '',
  updatedAt: '',
}

const localStatus = {
  runtime: 'ready' as const,
  activeModelId: 'local-model',
  modelDirectory: 'C:\\Models',
  defaultModelDirectory: 'C:\\Models',
  customModelDirectoryEnabled: false,
  models: [
    {
      id: 'local-model',
      label: 'Local model',
      sizeBytes: 1,
      license: 'MIT',
      installed: true,
      active: true,
      recommended: true,
    },
  ],
}

describe('resolveInlineAiProvider', () => {
  it('selects an explicit loopback Ollama default without requiring a key', () => {
    expect(
      resolveInlineAiProvider(
        'ollama',
        [
          provider,
          {
            ...provider,
            id: 'ollama',
            label: 'Ollama',
            kind: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:11434/v1',
            hasApiKey: false,
          },
        ],
        null,
      ),
    ).toEqual({ id: 'ollama', label: 'Ollama · model-a' })
  })

  it('does not fall back to cloud or local when an explicit default is unavailable', () => {
    expect(resolveInlineAiProvider('missing', [provider], localStatus)).toBeNull()
    expect(
      resolveInlineAiProvider('remote', [{ ...provider, hasApiKey: false }], localStatus),
    ).toBeNull()
    expect(
      resolveInlineAiProvider(
        'secure-loopback',
        [
          {
            ...provider,
            id: 'secure-loopback',
            kind: 'openai-compatible',
            baseUrl: 'https://localhost:11434/v1',
            hasApiKey: false,
          },
        ],
        localStatus,
      ),
    ).toBeNull()
  })

  it('automatically selects only when there is no explicit default', () => {
    expect(resolveInlineAiProvider(null, [provider], localStatus)).toEqual({
      id: 'remote',
      label: 'Remote · model-a',
    })
    expect(resolveInlineAiProvider(null, [], localStatus)).toEqual({
      id: 'marklab-local',
      label: 'Marklab Local · Local model',
    })
  })
})
