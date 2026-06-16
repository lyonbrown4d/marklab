import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownSourceEditor from '@/components/MarkdownSourceEditor'
import { requestFocusSourcePosition } from '@/utils/editorNavigation'

type CompletionProviderMock = {
  provideCompletionItems: (
    model: { getValue: () => string },
    position: { lineNumber: number; column: number },
  ) => {
    suggestions: Array<Record<string, unknown>>
  }
}

const monacoEditor = vi.hoisted(() => ({
  setPosition: vi.fn(),
  setSelection: vi.fn(),
  revealLineInCenter: vi.fn(),
  revealRangeInCenter: vi.fn(),
  focus: vi.fn(),
  createDecorationsCollection: vi.fn(() => ({
    set: vi.fn(),
    clear: vi.fn(),
  })),
  getModel: vi.fn(),
  onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
}))

const monaco = vi.hoisted(() => ({
  editor: {
    MarkerSeverity: {
      Error: 1,
      Warning: 2,
    },
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
    CompletionItemKind: {
      File: 1,
      Reference: 2,
      Keyword: 3,
    },
    registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  MarkerSeverity: {
    Error: 1,
    Warning: 2,
  },
}))

vi.mock('@/lib/monaco', () => ({
  configureMonaco: vi.fn(() => Promise.resolve()),
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
  monacoEditor.setPosition.mockClear()
  monacoEditor.setSelection.mockClear()
  monacoEditor.revealLineInCenter.mockClear()
  monacoEditor.revealRangeInCenter.mockClear()
  monacoEditor.focus.mockClear()
  monacoEditor.createDecorationsCollection.mockClear()
  monaco.languages.registerCompletionItemProvider.mockClear()
  monacoEditor.onDidChangeModelContent?.mockClear()
  monaco.editor.setModelMarkers.mockClear()
})

describe('MarkdownSourceEditor', () => {
  it('registers workspace-aware markdown completions', async () => {
    render(
      <MarkdownSourceEditor
        activePath="notes/current.md"
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
      .calls[0] as unknown as [string, CompletionProviderMock] | undefined
    expect(providerCall?.[0]).toBe('markdown')

    const provider = providerCall?.[1]
    const result = provider?.provideCompletionItems(
      { getValue: () => 'See [Target](' },
      { lineNumber: 1, column: 14 },
    )

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
      <MarkdownSourceEditor
        activePath="notes/current.md"
        value="See [Missing](missing.md) and [Bad Heading](target.md#unknown)\n[[Unknown]]"
        files={[
          { path: 'notes/current.md', kind: 'file' },
          { path: 'notes/target.md', kind: 'file' },
        ]}
        fileContents={{
          'notes/current.md':
            'See [Missing](missing.md) and [Bad Heading](target.md#unknown)\n[[Unknown]]',
        }}
        workspaceIndex={{
          files: [
            {
              path: 'notes/target.md',
              headings: [
                { path: 'notes/target.md', level: 1, text: 'Present', slug: 'present', line: 1 },
              ],
              links: [],
            },
          ],
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
