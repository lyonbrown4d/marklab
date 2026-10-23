// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
} from 'vscode-languageserver-types'
import {
  parseLanguageCompletion,
  parseLanguageDiagnostics,
} from '@/services/languageProtocolAdapter'

const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }

describe('native language protocol adapter', () => {
  it('validates LSP completion enums and handles omitted optional fields', () => {
    const result = parseLanguageCompletion({
      isIncomplete: false,
      items: [
        {
          label: 'Note',
          kind: CompletionItemKind.File,
          insertTextFormat: InsertTextFormat.PlainText,
          textEdit: { range, newText: 'note.md' },
        },
      ],
    })
    expect(result.items[0]).toMatchObject({
      kind: CompletionItemKind.File,
      textEdit: { range, newText: 'note.md' },
    })
    expect(result.items[0]?.documentation).toBeUndefined()
    expect(() =>
      parseLanguageCompletion({
        isIncomplete: false,
        items: [{ label: 'Invalid', kind: 26 }],
      }),
    ).toThrow()
  })

  it('preserves valid diagnostics and rejects unsupported severity and invalid coordinates', () => {
    expect(
      parseLanguageDiagnostics([
        {
          range,
          message: 'Missing note',
          severity: DiagnosticSeverity.Warning,
        },
      ]),
    ).toEqual([
      {
        range,
        message: 'Missing note',
        severity: DiagnosticSeverity.Warning,
        source: undefined,
      },
    ])
    expect(() => parseLanguageDiagnostics([{ range, message: 'Invalid', severity: 5 }])).toThrow()
    expect(() =>
      parseLanguageDiagnostics([
        {
          range: { ...range, start: { line: -1, character: 0 } },
          message: 'Invalid',
        },
      ]),
    ).toThrow()
  })
})
