import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourceCodeEditor from '@/components/SourceCodeEditor'
import { configureMonaco } from '@/lib/monaco'
import type { CompletionMock, SymbolMock } from '@/components/sourceEditorTestTypes'

const sourceShortcutMock = vi.hoisted(() => ({
  dispose: vi.fn(),
  register: vi.fn(() => ({ dispose: sourceShortcutMock.dispose })),
}))

const monacoEditor = vi.hoisted(() => ({
  setPosition: vi.fn(),
  setSelection: vi.fn(),
  revealRangeInCenter: vi.fn(),
  focus: vi.fn(),
  createDecorationsCollection: vi.fn(() => ({
    set: vi.fn(),
    clear: vi.fn(),
  })),
  getModel: vi.fn(),
  getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
  addCommand: vi.fn(() => 'mock.command'),
  onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
  onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
}))

const monaco = vi.hoisted(() => ({
  editor: {
    MarkerSeverity: { Error: 1, Warning: 2 },
    setModelMarkers: vi.fn(),
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
  languages: {
    CompletionItemKind: { File: 1, Reference: 2, Keyword: 3 },
    SymbolKind: { String: 1 },
    registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerDocumentSymbolProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerReferenceProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerRenameProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerCodeActionProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  MarkerSeverity: { Error: 1, Warning: 2 },
}))

vi.mock('@/lib/monaco', () => ({
  configureMonaco: vi.fn(),
}))

vi.mock('@/components/markdownSourceShortcuts', () => ({
  registerMarkdownSourceShortcuts: sourceShortcutMock.register,
}))

vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/store/usePreferencesStore', () => ({ usePreferencesStore: () => false }))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key === 'editor.sourceLoadFailed'
        ? `Failed to load source editor: ${values?.error ?? ''}`
        : key === 'editor.sourceLoading'
          ? 'Loading source editor...'
          : key,
  }),
}))

vi.mock('@/services/markdownLanguageApi', () => ({
  markdownLanguageApi: {
    getDiagnostics: vi.fn(() => Promise.reject(new Error('desktop unavailable'))),
    getDocumentSymbols: vi.fn(() => Promise.resolve([])),
    getDefinition: vi.fn(() => Promise.resolve(null)),
    getReferences: vi.fn(() => Promise.resolve([])),
    getCodeActions: vi.fn(() => Promise.resolve([])),
    getHover: vi.fn(() => Promise.resolve(null)),
    renameReferences: vi.fn(() =>
      Promise.resolve({ edits: [], appliedEdits: 0, touchedFiles: [], rejectReason: null }),
    ),
  },
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    onMount,
    onChange,
    value,
  }: {
    onMount?: (editor: typeof monacoEditor, monacoApi: typeof monaco) => void
    onChange?: (value?: string) => void
    value: string
  }) => {
    monacoEditor.getModel = vi.fn(() => ({
      getValue: () => value,
      getVersionId: () => 1,
      isDisposed: () => false,
      uri: { toString: () => 'file:///notes/current.md' },
    }))
    monacoEditor.onDidChangeModelContent = vi.fn(() => ({ dispose: vi.fn() }))
    onMount?.(monacoEditor, monaco)
    return (
      <textarea
        aria-label="markdown source"
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    )
  },
}))

beforeEach(() => {
  vi.mocked(configureMonaco).mockReset()
  vi.mocked(configureMonaco).mockResolvedValue(
    monaco as unknown as Awaited<ReturnType<typeof configureMonaco>>,
  )
  monacoEditor.setPosition.mockClear()
  monacoEditor.setSelection.mockClear()
  monacoEditor.revealRangeInCenter.mockClear()
  monacoEditor.focus.mockClear()
  monacoEditor.createDecorationsCollection.mockClear()
  monaco.languages.registerCompletionItemProvider.mockClear()
  monaco.languages.registerDocumentSymbolProvider.mockClear()
  monaco.editor.setModelMarkers.mockClear()
  sourceShortcutMock.dispose.mockClear()
  sourceShortcutMock.register.mockClear()
})

describe('SourceCodeEditor', () => {
  it('registers the shared configurable formatting shortcuts with Monaco', async () => {
    render(
      <SourceCodeEditor
        activePath="notes/current.md"
        workspaceKey="external:C:/notes"
        value="Alpha"
        files={[]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(sourceShortcutMock.register).toHaveBeenCalledWith(
        expect.objectContaining({ editor: monacoEditor }),
      ),
    )
  })

  it('registers workspace-aware markdown completions', async () => {
    render(
      <SourceCodeEditor
        activePath="notes/current.md"
        workspaceKey="external:C:/notes"
        value="See [Target]("
        files={[
          { path: 'notes/current.md', kind: 'file' },
          { path: 'notes/target.md', kind: 'file' },
        ]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalled()
    })

    const providerCall = monaco.languages.registerCompletionItemProvider.mock
      .calls[0] as unknown as [string, CompletionMock] | undefined
    expect(providerCall?.[0]).toBe('markdown')

    const provider = providerCall?.[1]
    const ownerModel = monacoEditor.getModel()
    monacoEditor.getModel.mockReturnValue(ownerModel)
    const result = await provider?.provideCompletionItems(ownerModel, {
      lineNumber: 1,
      column: 14,
    })

    expect(result?.suggestions[1]).toMatchObject({
      label: 'target',
      insertText: 'target.md',
      detail: 'notes/target.md',
      range: {
        startLineNumber: 1,
        startColumn: 14,
        endLineNumber: 1,
        endColumn: 14,
      },
    })
  })

  it('publishes link diagnostics for missing targets', async () => {
    render(
      <SourceCodeEditor
        activePath="notes/current.md"
        workspaceKey="external:C:/notes"
        value="See [Missing](missing.md) and [Bad Heading](target.md#unknown)\n[[Unknown]]"
        files={[
          { path: 'notes/current.md', kind: 'file' },
          { path: 'notes/target.md', kind: 'file' },
        ]}
        fileContents={{
          'notes/current.md':
            'See [Missing](missing.md) and [Bad Heading](target.md#unknown)\n[[Unknown]]',
          'notes/target.md': '# Present',
        }}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      const markers = monaco.editor.setModelMarkers.mock.calls.at(-1)?.[2] ?? []
      expect(markers).toHaveLength(3)
    })

    const markers = monaco.editor.setModelMarkers.mock.calls.at(-1)?.[2] ?? []
    expect(markers).toHaveLength(3)
    expect(markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Cannot find linked file "missing.md"',
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: 1,
        }),
        expect.objectContaining({
          message: 'Cannot find heading "unknown" in notes/target.md',
          severity: monaco.MarkerSeverity.Warning,
          startLineNumber: 1,
        }),
        expect.objectContaining({
          message: 'Cannot find linked note "Unknown"',
          severity: monaco.MarkerSeverity.Error,
        }),
      ]),
    )
  })

  it('registers markdown document symbols for the source outline', async () => {
    render(
      <SourceCodeEditor
        activePath="notes/current.md"
        workspaceKey="external:C:/notes"
        value="# Project\n\n## Plan"
        files={[{ path: 'notes/current.md', kind: 'file' }]}
        fileContents={{}}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(monaco.languages.registerDocumentSymbolProvider).toHaveBeenCalled()
    })

    const providerCall = monaco.languages.registerDocumentSymbolProvider.mock
      .calls[0] as unknown as [string, SymbolMock] | undefined
    expect(providerCall?.[0]).toBe('markdown')

    const symbols = await providerCall?.[1].provideDocumentSymbols({
      getValue: () => '# Project\n\n## Plan',
    })

    expect(symbols?.[0]).toMatchObject({
      name: 'Project',
      detail: 'H1',
      children: [expect.objectContaining({ name: 'Plan', detail: 'H2' })],
    })
  })
})
