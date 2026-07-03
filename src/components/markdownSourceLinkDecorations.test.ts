import { describe, expect, it, vi } from 'vitest'
import type { editor as MonacoEditor } from 'monaco-editor'

import { registerMarkdownLinkDecorations } from '@/components/markdownSourceLinkDecorations'

vi.mock('@/i18n/setup', () => ({
  default: {
    t: (key: string) =>
      key === 'editor.sourceLinkHint'
        ? 'Ctrl/Cmd click to open. Hover for preview. F2 on headings to rename.'
        : key,
  },
}))

describe('registerMarkdownLinkDecorations', () => {
  it('uses the localized source link hover hint', () => {
    const set = vi.fn()
    const monaco = {
      Range: class Range {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number

        constructor(
          startLineNumber: number,
          startColumn: number,
          endLineNumber: number,
          endColumn: number,
        ) {
          this.startLineNumber = startLineNumber
          this.startColumn = startColumn
          this.endLineNumber = endLineNumber
          this.endColumn = endColumn
        }
      },
    } as unknown as typeof import('monaco-editor')
    const editor = {
      createDecorationsCollection: () => ({ clear: vi.fn(), set }),
      getModel: () => ({
        getValue: () => 'See [Target](target.md) and [[Wiki Note]]',
      }),
      onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    } as unknown as MonacoEditor.IStandaloneCodeEditor

    registerMarkdownLinkDecorations(monaco, editor)

    expect(set).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          options: expect.objectContaining({
            hoverMessage: {
              value: 'Ctrl/Cmd click to open. Hover for preview. F2 on headings to rename.',
            },
          }),
        }),
      ]),
    )
  })
})
