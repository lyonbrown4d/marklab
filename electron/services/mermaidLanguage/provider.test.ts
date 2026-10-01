import { describe, expect, it } from 'vitest'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  Position,
  Range,
} from 'vscode-languageserver-types'

import {
  MermaidLanguageProvider,
  type MermaidTextDocument,
} from '@electron/services/mermaidLanguage/provider.js'

const document = (text: string): MermaidTextDocument => ({
  languageId: 'mermaid',
  text,
  uri: 'marklab-mermaid:///notes/example.md#diagram-1',
  version: 1,
})

const endPosition = (text: string): Position => {
  const lines = text.split('\n')
  return Position.create(lines.length - 1, lines.at(-1)?.length ?? 0)
}

describe('MermaidLanguageProvider completions', () => {
  it('offers supported diagram declarations for an empty document', () => {
    const result = new MermaidLanguageProvider().provideCompletions(
      document(''),
      Position.create(0, 0),
    )

    expect(result.isIncomplete).toBe(false)
    expect(result.items.map((item) => item.label)).toEqual([
      'flowchart diagram',
      'sequence diagram',
      'class diagram',
      'state diagram',
      'ER diagram',
      'Gantt chart',
      'mindmap',
      'timeline',
    ])
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        insertTextFormat: InsertTextFormat.Snippet,
        kind: CompletionItemKind.Module,
      }),
    )
  })

  it.each([
    ['flowchart LR\n  ', ['node', 'edge', 'subgraph']],
    ['graph TD\n  ', ['node', 'edge', 'subgraph']],
    ['sequenceDiagram\n  ', ['participant', 'message', 'alt block']],
    ['classDiagram\n  ', ['class', 'inheritance', 'association']],
    ['stateDiagram-v2\n  ', ['state', 'transition', 'start transition']],
    ['erDiagram\n  ', ['entity', 'relationship']],
    ['gantt\n  ', ['title', 'date format', 'section', 'task']],
    ['mindmap\n  ', ['root node', 'branch']],
    ['timeline\n  ', ['title', 'section', 'event']],
  ])('offers diagram-specific statements for %s', (text, expectedLabels) => {
    const result = new MermaidLanguageProvider().provideCompletions(
      document(text),
      endPosition(text),
    )

    expect(result.items.map((item) => item.label)).toEqual(expect.arrayContaining(expectedLabels))
  })

  it('uses class member completions inside a class body', () => {
    const text = ['classDiagram', '  class Customer {', '    '].join('\n')
    const result = new MermaidLanguageProvider().provideCompletions(
      document(text),
      endPosition(text),
    )

    expect(result.items.map((item) => item.label)).toEqual([
      'public method',
      'private field',
      'abstract method',
      'static method',
    ])
  })

  it('uses entity attribute completions inside an ER entity body', () => {
    const text = ['erDiagram', '  CUSTOMER {', '    '].join('\n')
    const result = new MermaidLanguageProvider().provideCompletions(
      document(text),
      endPosition(text),
    )

    expect(result.items.map((item) => item.label)).toEqual([
      'primary key attribute',
      'attribute',
      'foreign key attribute',
    ])
  })

  it('replaces only the statement prefix and preserves indentation', () => {
    const text = 'flowchart LR\n  sub'
    const result = new MermaidLanguageProvider().provideCompletions(
      document(text),
      endPosition(text),
    )
    const subgraph = result.items.find((item) => item.label === 'subgraph')

    expect(subgraph).toEqual(
      expect.objectContaining({
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          newText: 'subgraph ${1:name}\n  ${0}\nend',
          range: Range.create(Position.create(1, 2), Position.create(1, 5)),
        },
      }),
    )
  })

  it('returns no completions when the document exceeds the configured limit', () => {
    const provider = new MermaidLanguageProvider({ maxDocumentLength: 16 })
    const text = `flowchart LR\n${'A'.repeat(32)}`

    expect(provider.provideCompletions(document(text), endPosition(text))).toEqual({
      isIncomplete: false,
      items: [],
    })
  })
})

describe('MermaidLanguageProvider diagnostics', () => {
  it('reports an invalid diagram declaration with the default validator', async () => {
    const diagnostics = await new MermaidLanguageProvider().provideDiagnostics(
      document('flowchrt LR\n  A --> B'),
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'unknown-diagram',
        message: expect.stringContaining('flowchrt'),
        severity: DiagnosticSeverity.Hint,
        source: 'mermaid',
      }),
    ])
  })

  it.each(['kanban', 'treemap', 'radar-beta', 'usecase-beta'])(
    'accepts the Mermaid 12 %s declaration',
    async (declaration) => {
      await expect(
        new MermaidLanguageProvider().provideDiagnostics(document(declaration)),
      ).resolves.toEqual([])
    },
  )

  it('does not diagnose an incomplete declaration while the user is typing', async () => {
    await expect(
      new MermaidLanguageProvider().provideDiagnostics(document('flo')),
    ).resolves.toEqual([])
  })

  it('maps validator issues to LSP diagnostics', async () => {
    const range = Range.create(Position.create(1, 2), Position.create(1, 5))
    const provider = new MermaidLanguageProvider({
      validator: async () => [
        {
          code: 'unknown-node',
          message: 'Unknown node B',
          range,
          severity: DiagnosticSeverity.Warning,
        },
      ],
    })

    await expect(provider.provideDiagnostics(document('flowchart LR\n  A --> B'))).resolves.toEqual(
      [
        {
          code: 'unknown-node',
          message: 'Unknown node B',
          range,
          severity: DiagnosticSeverity.Warning,
          source: 'mermaid',
        },
      ],
    )
  })

  it('turns a thrown Mermaid parser error into a bounded diagnostic', async () => {
    const provider = new MermaidLanguageProvider({
      validator: async () => {
        throw {
          hash: { loc: { first_column: 2, first_line: 2, last_column: 6, last_line: 2 } },
          message: `Parse error\n${'detail '.repeat(200)}`,
        }
      },
    })

    const diagnostics = await provider.provideDiagnostics(document('flowchart LR\n  broken'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/^Parse error/),
        range: Range.create(Position.create(1, 2), Position.create(1, 6)),
        severity: DiagnosticSeverity.Error,
        source: 'mermaid',
      }),
    )
    const message = diagnostics[0]?.message
    expect(typeof message).toBe('string')
    if (typeof message === 'string') expect(message.length).toBeLessThanOrEqual(500)
  })

  it('skips the validator and reports a size-limit diagnostic for oversized documents', async () => {
    let validatorCalled = false
    const provider = new MermaidLanguageProvider({
      maxDocumentLength: 16,
      validator: async () => {
        validatorCalled = true
      },
    })

    const diagnostics = await provider.provideDiagnostics(document('flowchart LR\nA'.repeat(16)))

    expect(validatorCalled).toBe(false)
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'document-too-large',
        severity: DiagnosticSeverity.Information,
        source: 'mermaid',
      }),
    ])
  })

  it('keeps the size-limit range valid when the first line is empty', async () => {
    const provider = new MermaidLanguageProvider({ maxDocumentLength: 4 })

    const diagnostics = await provider.provideDiagnostics(document('\nflowchart LR'))

    expect(diagnostics[0]?.range).toEqual(
      Range.create(Position.create(0, 0), Position.create(0, 0)),
    )
  })

  it('rethrows cancellation instead of presenting it as a syntax error', async () => {
    const provider = new MermaidLanguageProvider({
      validator: async () => {
        const error = new Error('cancelled')
        error.name = 'AbortError'
        throw error
      },
    })

    await expect(provider.provideDiagnostics(document('flowchart LR'))).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
