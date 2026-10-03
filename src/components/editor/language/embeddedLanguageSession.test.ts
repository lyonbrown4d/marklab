import type { CompletionList } from 'vscode-languageserver-types'
import { describe, expect, it, vi } from 'vitest'
import {
  createEmbeddedLanguageSession,
  type EmbeddedLanguageClient,
} from '@/components/editor/language/embeddedLanguageSession'

const emptyCompletions: CompletionList = { isIncomplete: false, items: [] }

const createClient = (): EmbeddedLanguageClient => ({
  openDocument: vi.fn().mockResolvedValue(undefined),
  changeDocument: vi.fn().mockResolvedValue(undefined),
  closeDocument: vi.fn().mockResolvedValue(undefined),
  completion: vi.fn().mockResolvedValue(emptyCompletions),
  diagnostics: vi.fn().mockResolvedValue([]),
})

describe('createEmbeddedLanguageSession', () => {
  it('opens once, sends incremental changes before completion, and closes', async () => {
    const client = createClient()
    const session = createEmbeddedLanguageSession({
      client,
      uri: 'marklab-embedded://plate/diagram.mermaid',
      languageId: 'mermaid',
      text: 'graph TD',
    })

    session.change([
      {
        range: {
          start: { line: 0, character: 8 },
          end: { line: 0, character: 8 },
        },
        text: '\nA --> B',
      },
    ])
    await session.completion({ line: 1, character: 1 })
    await session.close()

    expect(client.openDocument).toHaveBeenCalledOnce()
    expect(client.changeDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://plate/diagram.mermaid',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 8 },
            end: { line: 0, character: 8 },
          },
          text: '\nA --> B',
        },
      ],
    })
    expect(client.completion).toHaveBeenCalledWith({
      uri: 'marklab-embedded://plate/diagram.mermaid',
      languageId: 'mermaid',
      version: 2,
      position: { line: 1, character: 1 },
    })
    expect(client.closeDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://plate/diagram.mermaid',
    })
  })
})
