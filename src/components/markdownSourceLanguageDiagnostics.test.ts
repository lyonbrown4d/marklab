import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { DiagnosticSeverity } from 'vscode-languageserver-types'
import { registerMarkdownSourceLanguageDiagnostics } from '@/components/markdownSourceLanguageDiagnostics'

describe('Markdown source language diagnostics', () => {
  let changeListener: () => void
  let model: editor.ITextModel
  const setModelMarkers = vi.fn()
  const prepareCompletion = vi.fn()
  const diagnostics = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    model = {
      uri: { toString: () => 'file:///workspace/note.md' },
      getVersionId: () => 3,
      isDisposed: () => false,
    } as editor.ITextModel
    prepareCompletion.mockResolvedValue({ uri: 'file:///workspace/note.md', version: 3 })
    diagnostics.mockResolvedValue([
      {
        code: 'unknown-diagram',
        message: 'Unknown diagram',
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 8 },
        },
        severity: DiagnosticSeverity.Hint,
        source: 'mermaid',
      },
    ])
  })

  it('requests diagnostics with only uri/version and maps LSP positions', async () => {
    const registration = registerMarkdownSourceLanguageDiagnostics({
      client: { diagnostics },
      documentSession: { prepareCompletion } as never,
      editor: {
        getModel: () => model,
        onDidChangeModelContent: (listener: () => void) => {
          changeListener = listener
          return { dispose: vi.fn() }
        },
      } as unknown as editor.IStandaloneCodeEditor,
      monaco: {
        MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
        editor: { setModelMarkers },
      } as never,
    })

    changeListener()
    await vi.advanceTimersByTimeAsync(150)

    expect(diagnostics).toHaveBeenCalledExactlyOnceWith({
      uri: 'file:///workspace/note.md',
      version: 3,
    })
    expect(diagnostics).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.anything() }),
    )
    expect(setModelMarkers).toHaveBeenLastCalledWith(model, 'marklab-language-intelligence', [
      expect.objectContaining({
        startLineNumber: 3,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 9,
        severity: 1,
        source: 'mermaid',
      }),
    ])
    registration.dispose()
  })
})
