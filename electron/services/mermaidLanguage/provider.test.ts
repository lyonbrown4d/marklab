import { describe, expect, it } from 'vitest'
import { CompletionItemKind, InsertTextFormat, Position, Range } from 'vscode-languageserver-types'

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

  it.each([
    'architecture-beta',
    'block-beta',
    'gitGraph',
    'kanban',
    'radar-beta',
    'treemap',
    'usecase-beta',
    'xychart-beta',
  ])('does not offer declaration snippets inside an unsupported %s body', (declaration) => {
    const text = `${declaration}\n  `

    expect(
      new MermaidLanguageProvider().provideCompletions(document(text), endPosition(text)).items,
    ).toEqual([])
  })
})
