import { describe, expect, it, vi } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { DiagnosticSeverity } from 'vscode-languageserver-types'

import { MarkdownLanguageIntelligenceProvider } from '@electron/services/languageIntelligence/markdownProvider.js'

describe('MarkdownLanguageIntelligenceProvider', () => {
  it('merges source-only Markdown syntax snippets into completion results', async () => {
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
    } as never)
    const result = await provider.completion({
      document: TextDocument.create('file:///workspace/note.md', 'markdown', 1, '/lin'),
      path: 'note.md',
      position: { line: 0, character: 4 },
      workspace: {} as never,
    })

    expect(result.items.map((item) => item.label)).toContain('Link')
    expect(result.items.find((item) => item.label === 'Link')).toMatchObject({
      insertTextFormat: 2,
      textEdit: {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
      },
    })
  })

  it('does not expose Markdown syntax snippets to embedded WYSIWYG documents', async () => {
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
    } as never)
    const result = await provider.completion({
      document: TextDocument.create(
        'marklab-embedded://document/markdown-fragment',
        'markdown',
        1,
        '/lin',
      ),
      path: 'note.md',
      position: { line: 0, character: 4 },
      workspace: {} as never,
    })

    expect(result.items).toEqual([])
  })

  it('routes source completions inside a Mermaid fence and maps ranges to Markdown', async () => {
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
    } as never)
    const result = await provider.completion({
      document: TextDocument.create(
        'file:///workspace/note.md',
        'markdown',
        1,
        '# Diagram\n```mermaid\nflow\n```',
      ),
      path: 'note.md',
      position: { line: 2, character: 4 },
      workspace: {} as never,
    })

    expect(result.items.find((item) => item.label === 'flowchart diagram')).toMatchObject({
      textEdit: {
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 4 },
        },
      },
    })
  })

  it('maps Mermaid fence diagnostics back to source Markdown lines', async () => {
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
    } as never)
    const diagnostics = await provider.diagnostics({
      document: TextDocument.create(
        'file:///workspace/note.md',
        'markdown',
        1,
        '# Diagram\n```mermaid\nflowchrt LR\n```',
      ),
      path: 'note.md',
    })

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'unknown-diagram',
        severity: DiagnosticSeverity.Hint,
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 8 },
        },
      }),
    ])
  })
})
