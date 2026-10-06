import { describe, expect, it, vi } from 'vitest'

import { AiInlineCompletionPolicy } from '@electron/services/ai/completion/policy'
import type { AiProviderStoreContract, StoredAiProvider } from '@electron/services/ai/types'

const remoteProvider: StoredAiProvider = {
  id: 'remote-openai',
  label: 'Remote',
  kind: 'openai',
  model: 'gpt-5-mini',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('AiInlineCompletionPolicy', () => {
  it('rejects a remote provider when persisted cloud-context consent is absent', async () => {
    const policy = createPolicy(remoteProvider, false)

    await expect(policy.assertProviderAllowed('remote-openai')).rejects.toThrow(/consent/i)
  })

  it('allows a remote provider when persisted cloud-context consent is enabled', async () => {
    const policy = createPolicy(remoteProvider, true)

    await expect(policy.assertProviderAllowed('remote-openai')).resolves.toBeUndefined()
  })

  it.each([
    [
      'ollama',
      {
        ...remoteProvider,
        id: 'ollama',
        kind: 'openai-compatible' as const,
        baseUrl: 'http://127.0.0.1:11434/v1',
      },
    ],
    [
      'local-compatible',
      {
        ...remoteProvider,
        id: 'local-compatible',
        kind: 'openai-compatible' as const,
        baseUrl: 'https://localhost:11434/v1',
      },
    ],
  ])('allows loopback provider %s without cloud-context consent', async (providerId, provider) => {
    const policy = createPolicy(provider, false)

    await expect(policy.assertProviderAllowed(providerId)).resolves.toBeUndefined()
  })
})

const createPolicy = (provider: StoredAiProvider, consent: boolean) => {
  const providerStore = {
    get: vi.fn(async () => provider),
  } as unknown as AiProviderStoreContract
  return new AiInlineCompletionPolicy({
    providerStore,
    readCloudContextConsent: () => consent,
  })
}
