import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import { configureMonaco } from '@/lib/monaco'
import { requestFocusSourcePosition } from '@/utils/editorNavigation'

const monacoEditor = vi.hoisted(() => ({
  addCommand: vi.fn(() => 'mock.command'),
  createDecorationsCollection: vi.fn(() => ({
    clear: vi.fn(),
    set: vi.fn(),
  })),
  focus: vi.fn(),
  getModel: vi.fn(),
  onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
  onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
  revealRangeInCenter: vi.fn(),
  setPosition: vi.fn(),
  setSelection: vi.fn(),
}))

const monaco = vi.hoisted(() => ({
  editor: {
    MarkerSeverity: { Error: 1, Warning: 2 },
    setModelMarkers: vi.fn(),
  },
  languages: {
    CompletionItemKind: { File: 1, Keyword: 3, Reference: 2 },
    SymbolKind: { String: 1 },
    registerCodeActionProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerDocumentSymbolProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerReferenceProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerRenameProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
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
}))

vi.mock('@/lib/monaco', () => ({
  configureMonaco: vi.fn(),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'editor.sourceLoading' ? 'Loading source editor...' : key),
  }),
}))

vi.mock('@/services/markdownLanguageApi', () => ({
  markdownLanguageApi: {
    getCodeActions: vi.fn(() => Promise.resolve([])),
    getCompletions: vi.fn(() => Promise.reject(new Error('desktop unavailable'))),
    getDefinition: vi.fn(() => Promise.resolve(null)),
    getDiagnostics: vi.fn(() => Promise.reject(new Error('desktop unavailable'))),
    getDocumentSymbols: vi.fn(() => Promise.resolve([])),
    getHover: vi.fn(() => Promise.resolve(null)),
    getReferences: vi.fn(() => Promise.resolve([])),
    renameReferences: vi.fn(() =>
      Promise.resolve({ appliedEdits: 0, edits: [], rejectReason: null, touchedFiles: [] }),
    ),
  },
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    onMount,
    value,
  }: {
    onMount?: (editor: typeof monacoEditor, monacoApi: typeof monaco) => void
    value: string
  }) => {
    monacoEditor.getModel = vi.fn(() => ({ getValue: () => value }))
    onMount?.(monacoEditor, monaco)
    return <textarea aria-label="markdown source" value={value} readOnly />
  },
}))

beforeEach(() => {
  vi.mocked(configureMonaco).mockReset()
  vi.mocked(configureMonaco).mockResolvedValue(
    monaco as unknown as Awaited<ReturnType<typeof configureMonaco>>,
  )
  monacoEditor.createDecorationsCollection.mockClear()
  monacoEditor.focus.mockClear()
  monacoEditor.revealRangeInCenter.mockClear()
  monacoEditor.setPosition.mockClear()
  monacoEditor.setSelection.mockClear()
})

describe('MarkdownSourceEditor source navigation', () => {
  it('focuses the requested source position for the active file', async () => {
    render(
      <MarkdownSourceEditor
        activePath="source.md"
        value="a\nb\nc"
        files={[]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

    await screen.findByLabelText('markdown source')

    requestFocusSourcePosition({ path: 'source.md', line: 3, column: 2, endColumn: 4 })

    expect(monacoEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 2 })
    expect(monacoEditor.setSelection).toHaveBeenCalledWith({
      startLineNumber: 3,
      startColumn: 2,
      endLineNumber: 3,
      endColumn: 4,
    })
    expect(monacoEditor.revealRangeInCenter).toHaveBeenCalledWith({
      startLineNumber: 3,
      startColumn: 2,
      endLineNumber: 3,
      endColumn: 4,
    })
    expect(monacoEditor.createDecorationsCollection).toHaveBeenCalled()
    expect(monacoEditor.focus).toHaveBeenCalled()
  })

  it('ignores source focus requests for other files', async () => {
    render(
      <MarkdownSourceEditor
        activePath="source.md"
        value="a\nb\nc"
        files={[]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

    await screen.findByLabelText('markdown source')

    requestFocusSourcePosition({ path: 'other.md', line: 1, column: 1 })

    expect(monacoEditor.setPosition).not.toHaveBeenCalled()
  })
})
