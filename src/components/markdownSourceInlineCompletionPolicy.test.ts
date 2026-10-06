import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveSourceProviderLocality } from '@/components/markdownSourceInlineCompletionPolicy'
import { aiApi } from '@/services/aiApi'

vi.mock('@/services/aiApi', () => ({ aiApi: { getProvider: vi.fn() } }))

const provider = {
  id: 'provider',
  label: 'Provider',
  kind: 'openai-compatible' as const,
  model: 'model',
  baseUrl: 'https://remote.example.com/v1',
  locality: 'local' as const,
  available: true,
  requiresApiKey: false,
  hasApiKey: false,
  apiKeySource: 'none' as const,
  maskedApiKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('resolveSourceProviderLocality', () => {
  beforeEach(() => vi.mocked(aiApi.getProvider).mockReset())

  it('trusts main-process capability data instead of reclassifying the URL', async () => {
    vi.mocked(aiApi.getProvider).mockResolvedValue(provider)

    await expect(resolveSourceProviderLocality(provider.id)).resolves.toBe('local')
  })

  it('returns unavailable when the main process marks the provider unavailable', async () => {
    vi.mocked(aiApi.getProvider).mockResolvedValue({ ...provider, available: false })
    expect(await resolveSourceProviderLocality(provider.id)).toBe('unavailable')
  })
})
