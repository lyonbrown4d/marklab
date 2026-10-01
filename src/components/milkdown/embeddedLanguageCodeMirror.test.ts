import { completionStatus, currentCompletions, startCompletion } from '@codemirror/autocomplete'
import { StreamLanguage } from '@codemirror/language'
import { diagnosticCount, forceLinting } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  MarkupKind,
} from 'vscode-languageserver-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEmbeddedLanguageCodeMirrorExtensions,
  mapEmbeddedCompletionItems,
  mapEmbeddedDiagnostics,
} from '@/components/milkdown/embeddedLanguageCodeMirror'
import type { EmbeddedLanguageClient } from '@/components/milkdown/embeddedLanguageSession'

const mermaidLanguage = StreamLanguage.define({
  name: 'mermaid',
  token: (stream) => {
    stream.skipToEnd()
    return null
  },
})

const createClient = () =>
  ({
    openDocument: vi.fn().mockResolvedValue(undefined),
    changeDocument: vi.fn().mockResolvedValue(undefined),
    closeDocument: vi.fn().mockResolvedValue(undefined),
    completion: vi.fn().mockResolvedValue([]),
    diagnostics: vi.fn().mockResolvedValue([]),
  }) satisfies EmbeddedLanguageClient

const views: EditorView[] = []
const createView = (client: EmbeddedLanguageClient, doc = 'sequence') => {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        mermaidLanguage,
        createEmbeddedLanguageCodeMirrorExtensions({
          client,
          createDocumentUri: (_languageId, ordinal) => `marklab-embedded://test/mermaid-${ordinal}`,
          lintDelay: 0,
        }),
      ],
    }),
  })
  views.push(view)
  return view
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy())
  vi.restoreAllMocks()
})

describe('embedded language CodeMirror adapter', () => {
  it('maps LSP completion metadata and snippets to CodeMirror options', () => {
    const state = EditorState.create({ doc: 'sequ' })
    const result = mapEmbeddedCompletionItems(
      state,
      [
        {
          label: 'sequenceDiagram',
          filterText: 'sequence diagram',
          kind: CompletionItemKind.Keyword,
          detail: 'Mermaid diagram',
          documentation: { kind: MarkupKind.Markdown, value: 'Starts a **sequence** diagram.' },
          insertText: 'sequenceDiagram',
        },
        {
          label: 'participant',
          kind: CompletionItemKind.Snippet,
          insertTextFormat: InsertTextFormat.Snippet,
          insertText: 'participant ${1:Alice}',
        },
      ],
      0,
    )

    expect(result.options[0]).toMatchObject({
      label: 'sequence diagram',
      displayLabel: 'sequenceDiagram',
      type: 'keyword',
      detail: 'Mermaid diagram',
      info: 'Starts a **sequence** diagram.',
      apply: 'sequenceDiagram',
    })
    expect(result.options[1]).toMatchObject({ label: 'participant', type: 'text' })
    expect(result.options[1]?.apply).toEqual(expect.any(Function))
  })

  it('maps and clamps LSP diagnostics to the current CodeMirror document', () => {
    const state = EditorState.create({ doc: 'graph TD\nA --> B' })
    const diagnostics = mapEmbeddedDiagnostics(state, [
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 99, character: 99 },
        },
        severity: DiagnosticSeverity.Warning,
        source: 'mermaid',
        message: 'Unexpected edge',
      },
    ])

    expect(diagnostics).toEqual([
      {
        from: 9,
        to: state.doc.length,
        severity: 'warning',
        source: 'mermaid',
        message: 'Unexpected edge',
      },
    ])
  })

  it('syncs incremental block edits and completes without sending document content', async () => {
    const client = createClient()
    client.completion.mockResolvedValue([{ label: 'sequenceDiagram' }])
    const view = createView(client)
    await vi.waitFor(() => expect(client.openDocument).toHaveBeenCalledOnce())

    view.dispatch({ changes: { from: 8, insert: 'Diagram' } })
    await vi.waitFor(() => expect(client.changeDocument).toHaveBeenCalledOnce())
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    startCompletion(view)
    await vi.waitFor(() => expect(currentCompletions(view.state)).toHaveLength(1))

    expect(client.changeDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://test/mermaid-1',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 8 },
            end: { line: 0, character: 8 },
          },
          text: 'Diagram',
        },
      ],
    })
    const completionRequest = client.completion.mock.calls[0]?.[0]
    expect(completionRequest).toEqual({
      uri: 'marklab-embedded://test/mermaid-1',
      languageId: 'mermaid',
      version: 2,
      position: { line: 0, character: 15 },
    })
    expect(completionRequest).not.toHaveProperty('text')
    expect(completionRequest).not.toHaveProperty('content')
  })

  it('sends multi-range transaction changes from document end to start', async () => {
    const client = createClient()
    const view = createView(client, 'abcdef')
    await vi.waitFor(() => expect(client.openDocument).toHaveBeenCalledOnce())

    view.dispatch({
      changes: [
        { from: 1, to: 2, insert: 'LONG' },
        { from: 4, to: 5, insert: 'Y' },
      ],
    })

    await vi.waitFor(() => expect(client.changeDocument).toHaveBeenCalledOnce())
    expect(client.changeDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://test/mermaid-1',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 4 },
            end: { line: 0, character: 5 },
          },
          text: 'Y',
        },
        {
          range: {
            start: { line: 0, character: 1 },
            end: { line: 0, character: 2 },
          },
          text: 'LONG',
        },
      ],
    })
  })

  it('applies each completion item to its own LSP text edit range', () => {
    const state = EditorState.create({ doc: 'alpha beta' })
    const result = mapEmbeddedCompletionItems(
      state,
      [
        {
          label: 'replace alpha',
          textEdit: {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
            newText: 'first',
          },
        },
        {
          label: 'replace beta',
          textEdit: {
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 10 },
            },
            newText: 'second',
          },
        },
      ],
      0,
    )
    const view = new EditorView({ state })
    views.push(view)
    const completion = result.options[1]

    expect(completion?.apply).toEqual(expect.any(Function))
    if (!completion || typeof completion.apply !== 'function') return
    completion.apply(view, completion, result.from, result.to ?? view.state.doc.length)

    expect(view.state.doc.toString()).toBe('alpha second')
  })

  it('surfaces diagnostics through CodeMirror lint without parent Markdown', async () => {
    const client = createClient()
    client.diagnostics?.mockResolvedValue([
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 8 },
        },
        severity: DiagnosticSeverity.Error,
        message: 'Unknown diagram type',
      },
    ])
    const view = createView(client, 'notValid')
    await vi.waitFor(() => expect(client.openDocument).toHaveBeenCalledOnce())

    forceLinting(view)

    await vi.waitFor(() => expect(diagnosticCount(view.state)).toBe(1))
    expect(client.diagnostics).toHaveBeenCalledWith({
      uri: 'marklab-embedded://test/mermaid-1',
      languageId: 'mermaid',
      version: 1,
    })
  })

  it('does not provide completions without an active supported fenced language', async () => {
    const client = createClient()
    const extensions = createEmbeddedLanguageCodeMirrorExtensions({ client })
    const view = new EditorView({
      state: EditorState.create({ doc: '# Markdown', extensions }),
    })
    views.push(view)

    startCompletion(view)

    await vi.waitFor(() => expect(completionStatus(view.state)).toBeNull())
    expect(client.openDocument).not.toHaveBeenCalled()
    expect(client.completion).not.toHaveBeenCalled()
  })
})
