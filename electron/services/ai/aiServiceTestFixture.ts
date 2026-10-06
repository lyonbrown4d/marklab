import type { LanguageModel } from 'ai'
import { vi } from 'vitest'

import { AiService } from '@electron/services/ai/aiService'
import type {
  AiEnvironment,
  AiProviderStoreContract,
  StoredAiProvider,
} from '@electron/services/ai/types'

export const storedProvider = {
  id: 'openai-main',
  label: 'OpenAI',
  kind: 'openai' as const,
  model: 'gpt-5-mini',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  encryptedApiKey: Buffer.from('encrypted').toString('base64'),
}

export const createService = (
  providerOverrides: Partial<StoredAiProvider> = {},
  environmentKey: string | undefined = undefined,
  environmentOverrides: Partial<AiEnvironment> = {},
) => {
  const provider: StoredAiProvider = { ...storedProvider, ...providerOverrides }
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
      ...environmentOverrides,
    },
  })
  return { generate, resolver, service, store }
}
