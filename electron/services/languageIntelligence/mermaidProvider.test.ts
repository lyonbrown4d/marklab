import { describe, expect, it, vi } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { MermaidLanguageIntelligenceProvider } from '@electron/services/languageIntelligence/mermaidProvider.js'

describe('MermaidLanguageIntelligenceProvider', () => {
  it('adapts the cached TextDocument to Mermaid diagnostics', async () => {
    const provideDiagnostics = vi.fn(async () => [
      {
        message: 'Broken edge',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      },
    ])
    const provider = new MermaidLanguageIntelligenceProvider({
      provideCompletions: vi.fn(() => ({ isIncomplete: false, items: [] })),
      provideDiagnostics,
    } as never)
    const document = TextDocument.create(
      'marklab-embedded://code-block/1.mermaid',
      'mermaid',
      3,
      'flowchart LR',
    )

    await expect(provider.diagnostics({ document, path: null })).resolves.toHaveLength(1)
    expect(provideDiagnostics).toHaveBeenCalledWith({
      uri: document.uri,
      languageId: 'mermaid',
      version: 3,
      text: 'flowchart LR',
    })
  })
})
