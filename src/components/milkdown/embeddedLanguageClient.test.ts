import { describe, expect, it, vi } from 'vitest'
import { createEmbeddedLanguageClient } from '@/components/milkdown/embeddedLanguageClient'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

describe('embedded language client', () => {
  it('adapts fenced-block sessions to the named language intelligence API', async () => {
    const api = {
      openDocument: vi.fn().mockResolvedValue({ ok: true, version: 1 }),
      changeDocument: vi.fn().mockResolvedValue({ ok: true, version: 2 }),
      closeDocument: vi.fn().mockResolvedValue({ ok: true }),
      completion: vi.fn().mockResolvedValue({ isIncomplete: false, items: [] }),
      diagnostics: vi.fn().mockResolvedValue([]),
    } satisfies LanguageIntelligenceApi
    const client = createEmbeddedLanguageClient(api)

    await client.openDocument({
      uri: 'marklab-embedded://code-block/1.mermaid',
      languageId: 'mermaid',
      version: 1,
      text: 'graph TD',
    })
    await client.completion({
      uri: 'marklab-embedded://code-block/1.mermaid',
      languageId: 'mermaid',
      version: 1,
      position: { line: 0, character: 8 },
    })
    await client.diagnostics?.({
      uri: 'marklab-embedded://code-block/1.mermaid',
      languageId: 'mermaid',
      version: 1,
    })

    expect(api.openDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://code-block/1.mermaid',
      languageId: 'mermaid',
      path: null,
      version: 1,
      text: 'graph TD',
    })
    expect(api.completion).toHaveBeenCalledWith({
      uri: 'marklab-embedded://code-block/1.mermaid',
      version: 1,
      position: { line: 0, character: 8 },
    })
    expect(api.diagnostics).toHaveBeenCalledWith({
      uri: 'marklab-embedded://code-block/1.mermaid',
      version: 1,
    })
  })
})
