import { createPlateEditor } from 'platejs/react'
import { unified } from 'unified'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyPlateDiagnosticAction,
  createPlateDiagnosticRanges,
  focusPlateDiagnostic,
} from '@/components/plate/plateDiagnosticRanges'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { serializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import * as paths from '@/logic/paths'
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
  afterEach(() => vi.restoreAllMocks())

  it('parses and extracts links once per invocation for many diagnostics', () => {
    const editor = createLinkEditor()
    const markdown = '# Title\n\nSee [Missing](missing.md) and keep this.\n'
    const parse = vi.spyOn(Object.getPrototypeOf(unified) as typeof unified, 'parse')
    const extract = vi.spyOn(paths, 'extractLinks')
    const diagnostics = Array.from({ length: 64 }, (_, index) => problem({ id: `issue-${index}` }))

    const ranges = createPlateDiagnosticRanges(editor, markdown, diagnostics)

    expect(parse).toHaveBeenCalledExactlyOnceWith(markdown)
    expect(extract).toHaveBeenCalledExactlyOnceWith(markdown)
    expect(ranges).toEqual(
      diagnostics.map((diagnostic) => ({
        anchor: { path: [1, 1, 0], offset: 0 },
        focus: { path: [1, 1, 0], offset: 7 },
        plateDiagnosticId: diagnostic.id,
        plateDiagnosticMessage: diagnostic.message,
        plateDiagnosticSeverity: diagnostic.severity,
      })),
    )

    parse.mockClear()
    extract.mockClear()
    const updated = markdown.replace('keep this', 'keep that')
    expect(createPlateDiagnosticRanges(editor, updated, diagnostics)).toEqual(ranges)
    expect(parse).toHaveBeenCalledExactlyOnceWith(updated)
    expect(extract).toHaveBeenCalledExactlyOnceWith(updated)
  })

  it('does not preprocess a document with no diagnostics', () => {
    const editor = createLinkEditor()
    const parse = vi.spyOn(Object.getPrototypeOf(unified) as typeof unified, 'parse')
    const extract = vi.spyOn(paths, 'extractLinks')

    expect(createPlateDiagnosticRanges(editor, '# Title', [])).toEqual([])
    expect(parse).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
  })

  it('maps CRLF source text across adjacent rich-text leaves', () => {
    const editor = createPlateEditor({
      plugins: createPlateEditorPlugins(),
      value: [
        { type: 'h1', children: [{ text: 'Title' }] },
        { type: 'p', children: [{ text: 'Hello ' }, { text: 'world', bold: true }] },
      ],
    })
    const ranges = createPlateDiagnosticRanges(editor, '# Title\r\n\r\nHello world\r\n', [
      problem({ startColumn: 4, endColumn: 10 }),
    ])

    expect(ranges).toEqual([
      expect.objectContaining({
        anchor: { path: [1, 0], offset: 3 },
        focus: { path: [1, 0], offset: 6 },
      }),
      expect.objectContaining({
        anchor: { path: [1, 1], offset: 0 },
        focus: { path: [1, 1], offset: 3 },
      }),
    ])
  })

  it('keeps blank lines unmapped and falls back to the first nonempty leaf', () => {
    const editor = createLinkEditor()
    const markdown = '# Title\n\nSee [Missing](missing.md) and keep this.\n'

    expect(
      createPlateDiagnosticRanges(editor, markdown, [
        problem({ line: 2 }),
        problem({ line: 99 }),
        problem({ startColumn: 100, endColumn: 110 }),
      ]),
    ).toEqual([
      expect.objectContaining({
        anchor: { path: [1, 0], offset: 0 },
        focus: { path: [1, 0], offset: 4 },
      }),
    ])
  })

  it('uses the nearest matching editor block when source indexes differ', () => {
    const editor = createPlateEditor({
      plugins: createPlateEditorPlugins(),
      value: [
        { type: 'p', children: [{ text: 'Same' }] },
        { type: 'p', children: [{ text: 'Other' }] },
        { type: 'p', children: [{ text: 'Same' }] },
      ],
    })

    expect(
      createPlateDiagnosticRanges(editor, '# Title\n\nSame', [
        problem({ startColumn: 1, endColumn: 5 }),
      ]),
    ).toEqual([
      expect.objectContaining({
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 4 },
      }),
    ])
  })

  it.each(['[First](first.md)', '[[first.md]]'])('indexes links on the same line: %s', (first) => {
    const editor = createPlateEditor({
      plugins: createPlateEditorPlugins(),
      value: [
        {
          type: 'p',
          children: [
            { type: 'a', url: 'first.md', children: [{ text: 'First' }] },
            { text: ' and ' },
            { type: 'a', url: 'second.md', children: [{ text: 'Second' }] },
          ],
        },
      ],
    })
    const markdown = `${first} and [Second](second.md)`
    const diagnostics = ['first.md', 'second.md'].map((target) =>
      problem({
        line: 1,
        startColumn: markdown.indexOf(target) + target.length + 1,
        endColumn: markdown.indexOf(target) + target.length + 1,
      }),
    )

    expect(createPlateDiagnosticRanges(editor, markdown, diagnostics)).toEqual([
      expect.objectContaining({
        anchor: { path: [0, 0, 0], offset: 0 },
        focus: { path: [0, 0, 0], offset: 5 },
      }),
      expect.objectContaining({
        anchor: { path: [0, 2, 0], offset: 0 },
        focus: { path: [0, 2, 0], offset: 6 },
      }),
    ])
  })

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

  it('indexes every line of a multiline block, including its final line', () => {
    const editor = createPlateEditor({
      plugins: createPlateEditorPlugins(),
      value: [{ type: 'p', children: [{ text: 'First\nLast' }] }],
    })

    expect(
      createPlateDiagnosticRanges(editor, 'First\nLast', [
        problem({ line: 2, startColumn: 1, endColumn: 5 }),
      ]),
    ).toEqual([
      expect.objectContaining({
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 10 },
      }),
    ])
  })

  it('rejects a quick fix extending beyond the link target without editing', () => {
    const editor = createLinkEditor()
    const markdown = '# Title\n\nSee [Missing](missing.md) and keep this.\n'
    const before = serializePlateMarkdown(editor, editor.children)

    expect(
      applyPlateDiagnosticAction(editor, markdown, problem(), {
        kind: 'replace-text',
        isPreferred: false,
        title: 'Invalid replacement',
        edit: {
          path: 'notes/current.md',
          line: 3,
          startColumn: 15,
          endColumn: 100,
          newText: 'known.md',
        },
      }),
    ).toBe(false)
    expect(serializePlateMarkdown(editor, editor.children)).toBe(before)
  })

  it('applies an anchor replacement as an undoable link-node operation', () => {
    const target = 'target.md#missing'
    const markdown = `# Title\n\nSee [Missing](${target}) and keep this.\n`
    const editor = createLinkEditor(target)
    const line = markdown.split('\n')[2] ?? ''
    const hash = line.indexOf('#')
    const action: MarkdownLanguageCodeAction = {
      kind: 'replace-text',
      isPreferred: false,
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
