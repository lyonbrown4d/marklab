import { createPlateEditor } from 'platejs/react'
import type { Value } from 'platejs'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { markdownTemplates } from '@/components/editor/slashMenuTemplates'
import {
  createPlateSlashCommands,
  getPlateSlashTrigger,
  runPlateSlashCommand,
} from '@/components/plate/slash/plateSlashCommands'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'

const createEditor = (text: string, prefix = '') => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [
      ...(prefix
        ? [
            {
              type: 'p',
              children: [
                { text: 'Existing' },
                { type: 'footnoteReference', identifier: prefix, children: [{ text: '' }] },
              ],
            },
            {
              type: 'footnoteDefinition',
              identifier: prefix,
              children: [{ type: 'p', children: [{ text: 'Existing note' }] }],
            },
          ]
        : []),
      { type: 'p', children: [{ text }] },
    ],
  })
  const paragraphIndex = editor.children.length - 1
  editor.selection = {
    anchor: { path: [paragraphIndex, 0], offset: text.length },
    focus: { path: [paragraphIndex, 0], offset: text.length },
  }
  return editor
}

const runCommand = async (key: string, beforeSlash = '', existingIdentifier = '') => {
  const editor = createEditor(`${beforeSlash}/${key}`, existingIdentifier)
  const command = createPlateSlashCommands(labels).find((item) => item.key === key)
  expect(command).toBeDefined()
  await runPlateSlashCommand({ editor, command: command!, trigger: getPlateSlashTrigger(editor)! })
  return editor
}

const createContextEditor = (value: Value, path: number[], offset: number) => {
  const editor = createPlateEditor({ plugins: createPlateEditorPlugins(), value })
  editor.selection = {
    anchor: { path, offset },
    focus: { path, offset },
  }
  return editor
}

describe('Plate footnote and math slash commands', () => {
  it('inserts semantic footnote reference and definition nodes', async () => {
    const editor = await runCommand('footnote')

    expect(editor.children).toEqual([
      {
        type: 'p',
        children: [
          { text: '' },
          { type: 'footnoteReference', identifier: '1', children: [{ text: '' }] },
          { text: '' },
        ],
      },
      {
        type: 'footnoteDefinition',
        identifier: '1',
        children: [{ type: 'p', children: [{ text: '' }] }],
      },
    ])
  })

  it('uses the next available identifier instead of duplicating an existing footnote', async () => {
    const editor = await runCommand('footnote', '', '1')
    const references = [
      ...editor.api.nodes({
        at: [],
        match: { type: 'footnoteReference' },
      }),
    ]

    expect(references.map(([node]) => node)).toEqual(
      expect.arrayContaining([expect.objectContaining({ identifier: '2' })]),
    )
    expect(editor.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'footnoteDefinition', identifier: '2' }),
      ]),
    )
  })

  it('keeps the source editor footnote template available', () => {
    expect(markdownTemplates.footnote).toBe('Text[^1]\n\n[^1]: Footnote\n')
  })

  it('inserts a semantic footnote after prose without replacing the paragraph', async () => {
    const editor = await runCommand('footnote', 'Keep this ')

    expect(editor.api.string([0])).toBe('Keep this ')
    expect(editor.children[0]).toMatchObject({
      type: 'p',
      children: expect.arrayContaining([
        expect.objectContaining({ type: 'footnoteReference', identifier: '1' }),
      ]),
    })
  })

  it.each([
    [
      'math-inline',
      [
        {
          type: 'p',
          children: [
            { text: '' },
            { type: 'inline_equation', texExpression: 'x', children: [{ text: '' }] },
            { text: '' },
          ],
        },
      ],
    ],
    ['math-block', [{ type: 'equation', texExpression: 'x', children: [{ text: '' }] }]],
  ] as const)('inserts a semantic %s node with the complete expected tree', async (key, tree) => {
    const editor = await runCommand(key)

    expect(editor.children).toEqual(tree)
  })

  it.each([
    [
      'footnote',
      'a code line',
      [
        {
          type: 'code_block',
          children: [{ type: 'code_line', children: [{ text: '/footnote' }] }],
        },
      ],
      [0, 0, 0],
    ],
    [
      'math-inline',
      'a code line',
      [
        {
          type: 'code_block',
          children: [{ type: 'code_line', children: [{ text: '/math-inline' }] }],
        },
      ],
      [0, 0, 0],
    ],
    [
      'footnote',
      'a block equation',
      [{ type: 'equation', texExpression: 'x', children: [{ text: '/footnote' }] }],
      [0, 0],
    ],
    [
      'math-inline',
      'an inline equation',
      [
        {
          type: 'p',
          children: [
            {
              type: 'inline_equation',
              texExpression: 'x',
              children: [{ text: '/math-inline' }],
            },
          ],
        },
      ],
      [0, 0, 0],
    ],
  ] satisfies ReadonlyArray<readonly [string, string, Value, number[]]>)(
    'leaves the complete tree unchanged for %s in %s',
    async (key, _context, value, path) => {
      const editor = createContextEditor(structuredClone(value), [...path], key.length + 1)
      const original = structuredClone(editor.children)
      const trigger = {
        query: key,
        range: {
          anchor: { path: [...path], offset: 0 },
          focus: { path: [...path], offset: key.length + 1 },
        },
        slashText: `/${key}`,
      }
      const command = createPlateSlashCommands(labels).find((item) => item.key === key)
      expect(command).toBeDefined()

      await runPlateSlashCommand({ editor, command: command!, trigger })

      expect(editor.children).toEqual(original)
    },
  )
})
