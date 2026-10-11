import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import {
  collectPlateDocumentFindMatches,
  collectPlateDocumentFindSource,
  materializePlateDocumentFindMatches,
  replaceAllPlateDocumentFindMatches,
  replacePlateDocumentFindMatch,
  type PlateDocumentFindOptions,
} from '@/components/plate/plateDocumentFindModel'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { scanPlateDocumentFindSource } from '@/workers/plateDocumentFindWorkerModel'

const defaults: PlateDocumentFindOptions = {
  matchCase: false,
  useRegex: false,
  wholeWord: false,
}

const createEditor = () =>
  createPlateEditor({
    nodeId: true,
    plugins: createPlateEditorPlugins(),
    value: [
      {
        children: [
          { bold: true, text: 'Alpha' },
          { text: ' alphabet alpha ' },
          { type: 'a', url: 'target.md', children: [{ text: 'alpha link' }] },
        ],
        id: 'paragraph',
        type: 'p',
      },
      {
        children: [
          {
            children: [
              { children: [{ children: [{ text: 'alpha cell' }], type: 'p' }], type: 'td' },
            ],
            type: 'tr',
          },
        ],
        id: 'table',
        type: 'table',
      },
    ],
  })

const collectRegexMatches = (editor: ReturnType<typeof createPlateEditor>, query: string) =>
  materializePlateDocumentFindMatches(
    scanPlateDocumentFindSource(collectPlateDocumentFindSource(editor), query, {
      matchCase: false,
      useRegex: true,
      wholeWord: false,
    }),
  )

describe('plate document find matcher', () => {
  it('uses case and whole-word options for every collected match', () => {
    const editor = createEditor()

    expect(collectPlateDocumentFindMatches(editor, 'Alpha', defaults)).toHaveLength(5)
    expect(
      collectPlateDocumentFindMatches(editor, 'Alpha', {
        ...defaults,
        matchCase: true,
        wholeWord: true,
      }),
    ).toHaveLength(1)
    expect(
      collectPlateDocumentFindMatches(editor, 'alpha', { ...defaults, wholeWord: true }),
    ).toHaveLength(4)
  })

  it('supports regular expressions and reports invalid patterns', () => {
    const editor = createEditor()
    const options = { ...defaults, useRegex: true }

    expect(collectRegexMatches(editor, 'alpha(?:bet)?')).toHaveLength(5)
    expect(collectPlateDocumentFindMatches(editor, '[', options)).toEqual([])
  })

  it('matches text split across marked leaves without removing adjacent marks', () => {
    const editor = createPlateEditor({
      value: [
        {
          type: 'p',
          children: [
            { bold: true, text: 'cross' },
            { italic: true, text: 'leaf' },
            { underline: true, text: ' stays' },
          ],
        },
      ],
    })
    const [match] = collectPlateDocumentFindMatches(editor, 'crossleaf', defaults)

    expect(replacePlateDocumentFindMatch(editor, match, 'joined')).toBe(true)
    expect(editor.api.string([])).toBe('joined stays')
    expect(editor.children).toEqual([
      {
        type: 'p',
        children: [
          { bold: true, text: 'joined' },
          { underline: true, text: ' stays' },
        ],
      },
    ])
  })

  it('replaces all matches in one undo batch while preserving links and tables', () => {
    const editor = createEditor()
    const matches = collectPlateDocumentFindMatches(editor, 'alpha', {
      ...defaults,
      wholeWord: true,
    })

    expect(replaceAllPlateDocumentFindMatches(editor, matches, 'omega')).toBe(4)
    expect(editor.api.string([])).toBe('omega alphabet omega omega linkomega cell')
    expect(editor.children[0]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ bold: true, text: 'omega' }),
        expect.objectContaining({ type: 'a', url: 'target.md' }),
      ]),
    })
    expect(editor.children[1]).toMatchObject({ type: 'table' })

    editor.undo()
    expect(editor.api.string([])).toBe('Alpha alphabet alpha alpha linkalpha cell')
  })

  it('expands regular-expression capture groups in replacement text', () => {
    const editor = createPlateEditor({
      value: [{ type: 'p', children: [{ text: 'issue-123' }] }],
    })
    const matches = collectRegexMatches(editor, 'issue-(\\d+)')

    expect(replaceAllPlateDocumentFindMatches(editor, matches, 'ticket-$1')).toBe(1)
    expect(editor.api.string([])).toBe('ticket-123')
  })

  it('keeps replacement tokens literal when regular expressions are disabled', () => {
    const editor = createPlateEditor({
      value: [{ type: 'p', children: [{ text: 'alpha' }] }],
    })
    const matches = collectPlateDocumentFindMatches(editor, 'alpha', defaults)

    expect(replaceAllPlateDocumentFindMatches(editor, matches, '$& $$ $1')).toBe(1)
    expect(editor.api.string([])).toBe('$& $$ $1')
  })

  it('expands captures without losing lookbehind and lookahead context', () => {
    const editor = createPlateEditor({
      value: [{ type: 'p', children: [{ text: 'prefix-123-suffix' }] }],
    })
    const matches = collectRegexMatches(editor, '(?<=prefix-)(\\d+)(?=-suffix)')

    expect(replaceAllPlateDocumentFindMatches(editor, matches, '[$1][$&]')).toBe(1)
    expect(editor.api.string([])).toBe('prefix-[123][123]-suffix')
  })
})
