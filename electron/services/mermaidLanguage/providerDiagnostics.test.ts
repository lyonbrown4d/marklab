import { describe, expect, it } from 'vitest'
import { DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types'

import {
  MermaidLanguageProvider,
  type MermaidTextDocument,
} from '@electron/services/mermaidLanguage/provider'
import { validateWithOfficialMermaidParser } from '@electron/services/mermaidLanguage/validationWorkerParser'

const document = (text: string): MermaidTextDocument => ({
  languageId: 'mermaid',
  text,
  uri: 'marklab-mermaid:///notes/example.md#diagram-1',
  version: 1,
})

const officialProvider = (): MermaidLanguageProvider =>
  new MermaidLanguageProvider({
    validator: ({ text }) => validateWithOfficialMermaidParser(text),
  })

describe('MermaidLanguageProvider diagnostics', () => {
  it('protects the validation worker with a bounded default document limit', async () => {
    const diagnostics = await new MermaidLanguageProvider().provideDiagnostics(
      document(`flowchart LR\n${'A'.repeat(128 * 1024)}`),
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'document-too-large',
        severity: DiagnosticSeverity.Information,
      }),
    ])
  })

  it('reports invalid Mermaid syntax with the official parser', async () => {
    const diagnostics = await officialProvider().provideDiagnostics(
      document('flowchrt LR\n  A --> B'),
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('flowchrt'),
        severity: DiagnosticSeverity.Error,
        source: 'mermaid',
      }),
    ])
  })

  it('reports invalid diagram body syntax beyond the declaration', async () => {
    const diagnostics = await officialProvider().provideDiagnostics(
      document('flowchart TD\n  A -->'),
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Parse error'),
        severity: DiagnosticSeverity.Error,
        source: 'mermaid',
      }),
    ])
  })

  it.each(['treemap', 'radar-beta', 'usecase-beta'])(
    'accepts the Mermaid 12 %s syntax',
    async (source) => {
      await expect(officialProvider().provideDiagnostics(document(source))).resolves.toEqual([])
    },
  )

  it('reports an incomplete declaration through the official parser', async () => {
    await expect(officialProvider().provideDiagnostics(document('flo'))).resolves.toEqual([
      expect.objectContaining({
        message: expect.stringContaining('flo'),
        severity: DiagnosticSeverity.Error,
        source: 'mermaid',
      }),
    ])
  })

  it('does not report an empty in-progress diagram', async () => {
    await expect(
      new MermaidLanguageProvider().provideDiagnostics(document('  \n')),
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
