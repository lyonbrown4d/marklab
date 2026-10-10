import { createPlateEditor } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import {
  applyPlateDiagnosticAction,
  createPlateDiagnosticRanges,
  focusPlateDiagnostic,
} from '@/components/plate/plateDiagnosticRanges'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { serializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'

const createLinkEditor = (target = 'missing.md') =>
  createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [
      { type: 'h1', children: [{ text: 'Title' }] },
      {
        type: 'p',
        children: [
          { text: 'See ' },
          { type: 'a', url: target, children: [{ text: 'Missing' }] },
          { text: ' and keep this.' },
        ],
      },
    ],
  })

const problem = (overrides: Partial<MarkdownSourceDiagnostic> = {}): MarkdownSourceDiagnostic => ({
  line: 3,
  startColumn: 15,
  endColumn: 25,
  message: 'Cannot find linked file "missing.md"',
  severity: 'error',
  ...overrides,
})

describe('Plate diagnostic ranges', () => {
  it('maps an invisible Markdown link target to the visible link text', () => {
    const editor = createLinkEditor()
    const markdown = '# Title\n\nSee [Missing](missing.md) and keep this.\n'

    expect(createPlateDiagnosticRanges(editor, markdown, [problem()])).toEqual([
      expect.objectContaining({
        anchor: { path: [1, 1, 0], offset: 0 },
        focus: { path: [1, 1, 0], offset: 7 },
        plateDiagnosticSeverity: 'error',
      }),
    ])
  })

  it('selects and scrolls the mapped rich-editor range', () => {
    const editor = createLinkEditor()
    editor.tf.focus = vi.fn()
    editor.api.scrollIntoView = vi.fn()

    expect(
      focusPlateDiagnostic(
        editor,
        '# Title\n\nSee [Missing](missing.md) and keep this.\n',
        problem(),
      ),
    ).toBe(true)
    expect(editor.selection).toEqual({
      anchor: { path: [1, 1, 0], offset: 0 },
      focus: { path: [1, 1, 0], offset: 7 },
    })
    expect(editor.api.scrollIntoView).toHaveBeenCalledOnce()
  })

  it('applies an anchor replacement as an undoable link-node operation', () => {
    const target = 'target.md#missing'
    const markdown = `# Title\n\nSee [Missing](${target}) and keep this.\n`
    const editor = createLinkEditor(target)
    const line = markdown.split('\n')[2] ?? ''
    const hash = line.indexOf('#')
    const action: MarkdownLanguageCodeAction = {
      kind: 'replace-text',
      title: 'Replace missing heading anchor',
      edit: {
        path: 'notes/current.md',
        line: 3,
        startColumn: hash + 1,
        endColumn: line.indexOf(')') + 1,
        newText: '#known',
      },
    }

    expect(
      applyPlateDiagnosticAction(
        editor,
        markdown,
        problem({ endColumn: line.indexOf(')') + 1 }),
        action,
      ),
    ).toBe(true)
    expect(serializePlateMarkdown(editor, editor.children).trim()).toBe(
      '# Title\n\nSee [Missing](target.md#known) and keep this.',
    )

    editor.tf.undo()
    expect(serializePlateMarkdown(editor, editor.children).trim()).toBe(
      '# Title\n\nSee [Missing](target.md#missing) and keep this.',
    )
  })
})
