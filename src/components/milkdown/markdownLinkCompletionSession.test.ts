import { CompletionItemKind } from 'vscode-languageserver-types'
import { describe, expect, it, vi } from 'vitest'

import {
  createMarkdownLinkCompletionSession,
  createMarkdownLinkSessionUri,
} from '@/components/milkdown/markdownLinkCompletionSession'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

const createClient = () => ({
  openDocument: vi.fn<LanguageIntelligenceApi['openDocument']>().mockResolvedValue({
    ok: true,
    version: 1,
  }),
  changeDocument: vi
    .fn<LanguageIntelligenceApi['changeDocument']>()
    .mockImplementation(async ({ version }) => ({ ok: true, version })),
  closeDocument: vi.fn<LanguageIntelligenceApi['closeDocument']>().mockResolvedValue({ ok: true }),
  completion: vi.fn<LanguageIntelligenceApi['completion']>().mockResolvedValue({
    isIncomplete: false,
    items: [
      {
        label: 'Guide',
        detail: 'docs/guide.md',
        kind: CompletionItemKind.File,
        textEdit: {
          newText: '../docs/guide.md',
          range: {
            start: { line: 0, character: 3 },
            end: { line: 0, character: 6 },
          },
        },
      },
      { label: 'Link snippet', kind: CompletionItemKind.Snippet, insertText: '[text](path)' },
    ],
  }),
})

describe('Markdown link completion session', () => {
  it('opens a tiny workspace-aware document and sends only incremental link queries', async () => {
    const client = createClient()
    const session = createMarkdownLinkCompletionSession({
      client,
      path: 'notes/today.md',
      uri: 'marklab-link-suggestion:test',
    })

    const suggestions = await session.complete('gui')

    expect(client.openDocument).toHaveBeenCalledWith({
      uri: 'marklab-link-suggestion:test',
      languageId: 'markdown',
      path: 'notes/today.md',
      version: 1,
      text: '[]()',
    })
    expect(client.changeDocument).toHaveBeenCalledWith({
      uri: 'marklab-link-suggestion:test',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 3 },
            end: { line: 0, character: 3 },
          },
          rangeLength: 0,
          text: 'gui',
        },
      ],
    })
    expect(client.completion).toHaveBeenCalledWith({
      uri: 'marklab-link-suggestion:test',
      version: 2,
      position: { line: 0, character: 6 },
    })
    expect(client.completion.mock.calls[0]?.[0]).not.toHaveProperty('text')
    expect(suggestions).toEqual([
      { label: 'Guide', detail: 'docs/guide.md', url: '../docs/guide.md' },
    ])
  })

  it('replaces only the previous query and closes the virtual document', async () => {
    const client = createClient()
    const session = createMarkdownLinkCompletionSession({
      client,
      path: 'notes/today.md',
      uri: 'marklab-link-suggestion:test',
    })

    await session.complete('guide')
    await session.complete('docs')
    await session.close()

    expect(client.changeDocument).toHaveBeenLastCalledWith({
      uri: 'marklab-link-suggestion:test',
      version: 3,
      changes: [
        {
          range: {
            start: { line: 0, character: 3 },
            end: { line: 0, character: 8 },
          },
          rangeLength: 5,
          text: 'docs',
        },
      ],
    })
    expect(client.closeDocument).toHaveBeenCalledWith({ uri: 'marklab-link-suggestion:test' })
  })

  it('recovers a failed incremental change by reopening the latest tiny document', async () => {
    const client = createClient()
    client.changeDocument.mockRejectedValueOnce(new Error('out of sync'))
    const session = createMarkdownLinkCompletionSession({
      client,
      path: 'notes/today.md',
      uri: 'marklab-link-suggestion:recovery',
    })

    await expect(session.complete('gui')).rejects.toThrow('out of sync')
    await expect(session.complete('guide')).resolves.toEqual([
      { label: 'Guide', detail: 'docs/guide.md', url: '../docs/guide.md' },
    ])

    expect(client.closeDocument).toHaveBeenCalledWith({
      uri: 'marklab-link-suggestion:recovery',
    })
    expect(client.openDocument).toHaveBeenLastCalledWith({
      uri: 'marklab-link-suggestion:recovery',
      languageId: 'markdown',
      path: 'notes/today.md',
      version: 3,
      text: '[](guide)',
    })
    expect(client.completion).toHaveBeenLastCalledWith({
      uri: 'marklab-link-suggestion:recovery',
      version: 3,
      position: { line: 0, character: 8 },
    })
  })

  it('rejects new completion work as soon as closing starts', async () => {
    const client = createClient()
    let releaseCompletion: (() => void) | undefined
    client.completion.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseCompletion = () => resolve({ isIncomplete: false, items: [] })
        }),
    )
    const session = createMarkdownLinkCompletionSession({
      client,
      path: null,
      uri: 'marklab-link-suggestion:closing',
    })

    const pending = session.complete('guide')
    await vi.waitFor(() => expect(client.completion).toHaveBeenCalledOnce())
    const closing = session.close()
    await expect(session.complete('other')).rejects.toThrow('session is closed')
    releaseCompletion?.()
    await pending
    await closing
  })

  it('creates a distinct virtual document URI for every session', () => {
    expect(createMarkdownLinkSessionUri()).not.toBe(createMarkdownLinkSessionUri())
  })
})
