import { useEffect, useRef } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
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
  getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
  onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
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

vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/store/usePreferencesStore', () => ({ usePreferencesStore: () => false }))

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

vi.mock('@monaco-editor/react', () => {
  const MockMonacoEditor = ({
    onMount,
    value,
  }: {
    onMount?: (editor: typeof monacoEditor, monacoApi: typeof monaco) => void
    value: string
  }) => {
    const valueRef = useRef(value)
    const mountRef = useRef(onMount)
    useEffect(() => {
      valueRef.current = value
    }, [value])
    useEffect(() => {
      monacoEditor.getModel = vi.fn(() => ({ getValue: () => valueRef.current }))
      mountRef.current?.(monacoEditor, monaco)
    }, [])
    return <textarea aria-label="markdown source" value={value} readOnly />
  }
  return { default: MockMonacoEditor }
})

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

const sourceProps = {
  activePath: 'source.md',
  value: 'a\nb\nc',
  files: [],
  fileContents: {},
  onChange: vi.fn(),
}

const deferMonaco = () => {
  type MonacoApi = Awaited<ReturnType<typeof configureMonaco>>
  let resolve!: (api: MonacoApi) => void
  const loading = new Promise<MonacoApi>((accept) => {
    resolve = accept
  })
  vi.mocked(configureMonaco).mockReturnValue(loading)
  return async () => {
    await act(async () => {
      resolve(monaco as unknown as MonacoApi)
      await loading
    })
    await screen.findByLabelText('markdown source')
  }
}

describe('MarkdownSourceEditor source navigation', () => {
  it('replays only the latest matching request after Monaco loads without changing content', async () => {
    const finishLoading = deferMonaco()
    const onChange = vi.fn()
    const view = render(<MarkdownSourceEditor {...sourceProps} onChange={onChange} />)

    requestFocusSourcePosition({ path: 'source.md', line: 1, column: 1 })
    requestFocusSourcePosition({ path: 'source.md', line: 3, column: 1, endColumn: 2 })
    requestFocusSourcePosition({ path: 'other.md', line: 2, column: 1 })
    expect(monacoEditor.setPosition).not.toHaveBeenCalled()
    await finishLoading()

    expect(monacoEditor.setPosition).toHaveBeenCalledExactlyOnceWith({ lineNumber: 3, column: 1 })
    expect(monacoEditor.setSelection).toHaveBeenCalledWith({
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 2,
    })
    expect(screen.getByLabelText('markdown source')).toHaveValue(sourceProps.value)
    expect(onChange).not.toHaveBeenCalled()
    view.rerender(<MarkdownSourceEditor {...sourceProps} onChange={onChange} value="updated" />)
    expect(monacoEditor.setPosition).toHaveBeenCalledTimes(1)
  })

  it('drops a queued request when switching away and back before Monaco loads', async () => {
    const finishLoading = deferMonaco()
    const view = render(<MarkdownSourceEditor {...sourceProps} />)
    requestFocusSourcePosition({ path: 'source.md', line: 3, column: 1 })

    view.rerender(<MarkdownSourceEditor {...sourceProps} activePath="other.md" />)
    view.rerender(<MarkdownSourceEditor {...sourceProps} />)
    await finishLoading()

    expect(monacoEditor.setPosition).not.toHaveBeenCalled()
    expect(monacoEditor.focus).not.toHaveBeenCalled()
  })

  it('replays navigation for the new document when switching during loading', async () => {
    const finishLoading = deferMonaco()
    const view = render(<MarkdownSourceEditor {...sourceProps} />)
    requestFocusSourcePosition({ path: 'source.md', line: 3, column: 1 })
    view.rerender(<MarkdownSourceEditor {...sourceProps} activePath="other.md" />)
    requestFocusSourcePosition({ path: 'other.md', line: 2, column: 1 })
    await finishLoading()

    expect(monacoEditor.setPosition).toHaveBeenCalledExactlyOnceWith({ lineNumber: 2, column: 1 })
  })

  it('does not replay a queued request into a replacement editor after unmount', async () => {
    const finishLoading = deferMonaco()
    const view = render(<MarkdownSourceEditor {...sourceProps} />)
    requestFocusSourcePosition({ path: 'source.md', line: 3, column: 1 })
    await waitFor(() => expect(configureMonaco).toHaveBeenCalledTimes(1))
    view.unmount()
    render(<MarkdownSourceEditor {...sourceProps} />)
    await waitFor(() => expect(configureMonaco).toHaveBeenCalledTimes(2))
    await finishLoading()

    expect(monacoEditor.setPosition).not.toHaveBeenCalled()
  })

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
