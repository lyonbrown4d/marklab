import { currentCompletions, startCompletion } from '@codemirror/autocomplete'
import { diagnosticCount } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMermaidCodeMirrorIntelligence } from '@/components/plate/code/mermaidCodeMirrorLanguage'

const languageClient = vi.hoisted(() => ({
  changeDocument: vi.fn().mockResolvedValue(undefined),
  closeDocument: vi.fn().mockResolvedValue(undefined),
  completion: vi.fn().mockResolvedValue({
    isIncomplete: false,
    items: [{ detail: 'Diagram direction', kind: 14, label: 'flowchart' }],
  }),
  diagnostics: vi.fn().mockResolvedValue([]),
  openDocument: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/components/editor/language/embeddedLanguageClient', () => ({
  embeddedLanguageClient: languageClient,
}))

describe('createMermaidCodeMirrorIntelligence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends precise changes, serves LSP completions, and disposes its document session', async () => {
    languageClient.diagnostics.mockResolvedValueOnce([
      {
        message: { kind: 'markdown', value: 'Unknown node' },
        range: {
          end: { character: 9, line: 0 },
          start: { character: 0, line: 0 },
        },
        severity: 2,
      },
    ])
    const value = 'flowchart TD\nA --> B'
    const intelligence = createMermaidCodeMirrorIntelligence({
      uri: 'marklab-embedded://plate/diagram.mermaid',
      value,
    })
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: value, extensions: intelligence.extensions }),
    })

    view.dispatch({
      changes: [
        { from: 0, insert: 'graph', to: 9 },
        { from: value.length - 1, insert: 'C', to: value.length },
      ],
    })
    view.focus()
    expect(startCompletion(view)).toBe(true)
    await vi.waitFor(() => expect(languageClient.completion).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(currentCompletions(view.state).map(({ label }) => label)).toContain('flowchart'),
    )
    await vi.waitFor(() => expect(diagnosticCount(view.state)).toBe(1))
    expect(languageClient.changeDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          {
            range: {
              end: { character: 7, line: 1 },
              start: { character: 6, line: 1 },
            },
            rangeLength: 1,
            text: 'C',
          },
          {
            range: {
              end: { character: 9, line: 0 },
              start: { character: 0, line: 0 },
            },
            rangeLength: 9,
            text: 'graph',
          },
        ],
      }),
    )

    intelligence.dispose()
    await vi.waitFor(() =>
      expect(languageClient.closeDocument).toHaveBeenCalledWith({
        uri: 'marklab-embedded://plate/diagram.mermaid',
      }),
    )
    view.destroy()
    parent.remove()
  })
})
