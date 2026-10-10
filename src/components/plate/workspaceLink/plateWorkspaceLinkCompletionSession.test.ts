import { CompletionItemKind } from 'vscode-languageserver-types'
import { describe, expect, it, vi } from 'vitest'
import { createPlateWorkspaceLinkCompletionSession } from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletionSession'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'

const createClients = () => ({
  codeActions: {
    getCodeActions: vi.fn(async (): Promise<MarkdownLanguageCodeAction[]> => []),
  },
  completion: {
    openDocument: vi.fn(async () => ({ ok: true as const, version: 1 })),
    changeDocument: vi.fn(async (request) => ({ ok: true as const, version: request.version })),
    closeDocument: vi.fn(async () => ({ ok: true as const })),
    completion: vi.fn(async () => ({
      isIncomplete: false,
      items: [
        {
          label: 'Target',
          detail: 'notes/Target.md',
          kind: CompletionItemKind.File,
          textEdit: {
            newText: 'Target',
            range: {
              start: { line: 2, character: 2 },
              end: { line: 2, character: 5 },
            },
          },
        },
      ],
    })),
  },
})

describe('Plate workspace-link completion session', () => {
  it('maps language completions to query-relative replacements and closes its document', async () => {
    const clients = createClients()
    const session = createPlateWorkspaceLinkCompletionSession({
      ...clients,
      path: 'notes/current.md',
      uri: 'marklab-rich-workspace-link:test',
    })

    await expect(session.complete('# Current', 'tar')).resolves.toEqual([
      {
        detail: 'notes/Target.md',
        insertText: 'Target',
        kind: 'file',
        label: 'Target',
        replacementLength: 3,
      },
    ])
    expect(clients.completion.openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'notes/current.md', text: '# Current\n\n[[tar' }),
    )

    await session.close()
    expect(clients.completion.closeDocument).toHaveBeenCalledWith({
      uri: 'marklab-rich-workspace-link:test',
    })
  })

  it('surfaces create-file and replace-anchor code actions as explicit choices', async () => {
    const clients = createClients()
    clients.completion.completion.mockResolvedValue({ isIncomplete: false, items: [] })
    clients.codeActions.getCodeActions.mockResolvedValue([
      {
        kind: 'create-file',
        path: 'Missing.md',
        content: '# Plan\n',
        title: 'Create missing Markdown file "Missing.md"',
      },
      {
        kind: 'replace-text',
        edit: {
          path: 'notes/current.md',
          line: 1,
          startColumn: 9,
          endColumn: 14,
          newText: '#plan',
        },
        title: 'Replace missing heading anchor with "#plan"',
      },
    ])
    const session = createPlateWorkspaceLinkCompletionSession({
      ...clients,
      path: 'notes/current.md',
      uri: 'marklab-rich-workspace-link:actions',
    })

    await expect(session.complete('', 'Missing#draft')).resolves.toEqual([
      expect.objectContaining({ kind: 'create-file', replacementLength: 0 }),
      expect.objectContaining({
        insertText: '#plan',
        kind: 'replace-anchor',
        replacementLength: 6,
      }),
    ])
  })
})
