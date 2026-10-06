import { beforeEach, describe, expect, it, vi } from 'vitest'
import { embeddedLanguageClient } from '@/components/editor/language/embeddedLanguageClient'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'

vi.mock('@/services/languageIntelligenceApi', () => ({
  languageIntelligenceApi: {
    changeDocument: vi.fn(),
    closeDocument: vi.fn(),
    completion: vi.fn(),
    diagnostics: vi.fn(),
    openDocument: vi.fn(),
  },
}))

describe('embeddedLanguageClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes open-only identity fields from completion and diagnostics IPC payloads', async () => {
    vi.mocked(languageIntelligenceApi.completion).mockResolvedValue({
      isIncomplete: false,
      items: [],
    })
    vi.mocked(languageIntelligenceApi.diagnostics).mockResolvedValue([])
    const identity = {
      languageId: 'mermaid',
      uri: 'marklab-embedded://plate/diagram.mermaid',
      version: 2,
    }

    await embeddedLanguageClient.completion({ ...identity, position: { character: 4, line: 1 } })
    await embeddedLanguageClient.diagnostics?.(identity)

    expect(languageIntelligenceApi.completion).toHaveBeenCalledExactlyOnceWith({
      position: { character: 4, line: 1 },
      uri: identity.uri,
      version: 2,
    })
    expect(languageIntelligenceApi.diagnostics).toHaveBeenCalledExactlyOnceWith({
      uri: identity.uri,
      version: 2,
    })
  })
})
