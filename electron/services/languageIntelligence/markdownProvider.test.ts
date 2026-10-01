import { describe, expect, it, vi } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { DiagnosticSeverity } from 'vscode-languageserver-types'

import { MarkdownLanguageIntelligenceProvider } from '@electron/services/languageIntelligence/markdownProvider.js'

describe('MarkdownLanguageIntelligenceProvider', () => {
  it('merges source-only Markdown syntax snippets into completion results', async () => {
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
      getDiagnostics: vi.fn(async () => []),
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
      getDiagnostics: vi.fn(async () => []),
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

  it('marks capped workspace file completions as incomplete', async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      label: `note-${index}`,
      kind: 'file' as const,
      insertText: `note-${index}.md`,
      replacementStartColumn: 2,
      lspKind: 17,
    }))
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => items),
      getDiagnostics: vi.fn(async () => []),
    } as never)

    const result = await provider.completion({
      document: TextDocument.create('file:///workspace/note.md', 'markdown', 1, ']('),
      path: 'note.md',
      position: { line: 0, character: 2 },
      workspace: {} as never,
    })

    expect(result.isIncomplete).toBe(true)
  })

  it('routes source completions inside a Mermaid fence and maps ranges to Markdown', async () => {
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
      getDiagnostics: vi.fn(async () => []),
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
      getDiagnostics: vi.fn(async () => []),
    } as never)
    const diagnostics = await provider.diagnostics({
      document: TextDocument.create(
        'file:///workspace/note.md',
        'markdown',
        1,
        '# Diagram\n```mermaid\nflowchrt LR\n```',
      ),
      path: 'note.md',
      workspace: {} as never,
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

  it('maps workspace Markdown diagnostics from the synchronized document', async () => {
    const getDiagnostics = vi.fn(async () => [
      {
        line: 2,
        start_column: 5,
        end_column: 15,
        message: 'Cannot find linked file "missing.md"',
        severity: 'error' as const,
      },
    ])
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
      getDiagnostics,
    } as never)
    const workspace = {} as never
    const content = '# Note\nSee [Missing](missing.md).'

    const diagnostics = await provider.diagnostics({
      document: TextDocument.create('file:///workspace/note.md', 'markdown', 3, content),
      path: 'note.md',
      workspace,
    })

    expect(getDiagnostics).toHaveBeenCalledExactlyOnceWith(workspace, {
      path: 'note.md',
      content,
    })
    expect(diagnostics).toContainEqual({
      message: 'Cannot find linked file "missing.md"',
      range: {
        start: { line: 1, character: 4 },
        end: { line: 1, character: 14 },
      },
      severity: DiagnosticSeverity.Error,
      source: 'markdown',
    })
  })

  it('skips diagnostics for documents above the full diagnostics limit', async () => {
    const getDiagnostics = vi.fn(async () => [])
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
      getDiagnostics,
    } as never)

    const diagnostics = await provider.diagnostics({
      document: TextDocument.create(
        'file:///workspace/large.md',
        'markdown',
        1,
        'x'.repeat(500_001),
      ),
      path: 'large.md',
      workspace: {} as never,
    })

    expect(diagnostics).toEqual([])
    expect(getDiagnostics).not.toHaveBeenCalled()
  })

  it('ignores Mermaid fences indented by four spaces', async () => {
    const provider = new MarkdownLanguageIntelligenceProvider({
      getCompletions: vi.fn(async () => []),
      getDiagnostics: vi.fn(async () => []),
    } as never)
    const diagnostics = await provider.diagnostics({
      document: TextDocument.create(
        'file:///workspace/note.md',
        'markdown',
        1,
        '    ```mermaid\n    flowchrt LR\n    ```',
      ),
      path: 'note.md',
      workspace: {} as never,
    })

    expect(diagnostics).toEqual([])
  })
})
