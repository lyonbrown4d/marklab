import type { Value } from 'platejs'
import { createPlateEditor, type PlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { createPlateDocumentCompletionIndex } from '@/components/plate/completion/plateDocumentCompletionIndex'
import { buildPlateInlineCompletionContext } from '@/components/plate/completion/plateInlineCompletionContext'

const createEditor = (value: Value, activeIndex = value.length - 1) => {
  const editor = createPlateEditor({ value })
  const text = editor.api.string([activeIndex])
  editor.tf.select({
    anchor: { path: [activeIndex, 0], offset: text.length },
    focus: { path: [activeIndex, 0], offset: text.length },
  })
  return editor
}

const queryAtSelection = (
  index: ReturnType<typeof createPlateDocumentCompletionIndex>,
  editor: PlateEditor,
) => {
  const context = buildPlateInlineCompletionContext(editor)
  if (!context) throw new Error('Expected a completion context')
  return index.query(context)
}

describe('Plate document completion index', () => {
  it.each([
    {
      active: 'Project notes continue',
      expected: ' with the release checklist.',
      reference: 'Project notes continue with the release checklist.',
    },
    {
      active: 'Release计划',
      expected: '面向AI users and reviewers.',
      reference: 'Release计划面向AI users and reviewers.',
    },
  ])('hydrates Plate blocks for $active', ({ active, expected, reference }) => {
    const editor = createEditor([
      { id: 'reference', type: 'p', children: [{ text: reference }] },
      { id: 'active', type: 'p', children: [{ text: active }] },
    ])
    const index = createPlateDocumentCompletionIndex(editor)

    index.hydrate()

    expect(queryAtSelection(index, editor)[0]?.text).toBe(expected)
    index.destroy()
  })

  it('upserts changed text blocks without retaining the previous completion', () => {
    const editor = createEditor([
      { id: 'reference', type: 'p', children: [{ text: 'Draft continues with stale text.' }] },
      { id: 'active', type: 'p', children: [{ text: 'Draft continues with' }] },
    ])
    const index = createPlateDocumentCompletionIndex(editor)
    index.hydrate()
    expect(queryAtSelection(index, editor)[0]?.text).toBe(' stale text.')

    editor.tf.select({
      anchor: { path: [0, 0], offset: 'Draft continues with '.length },
      focus: { path: [0, 0], offset: 'Draft continues with stale'.length },
    })
    editor.tf.insertText('current')
    editor.tf.select({
      anchor: { path: [1, 0], offset: 'Draft continues with'.length },
      focus: { path: [1, 0], offset: 'Draft continues with'.length },
    })
    index.syncEditorChanges()

    expect(queryAtSelection(index, editor)[0]?.text).toBe(' current text.')
    expect(queryAtSelection(index, editor).map(({ text }) => text)).not.toContain(' stale text.')
    index.destroy()
  })

  it('rehydrates after a structural editor operation', () => {
    const editor = createEditor([
      { id: 'active', type: 'p', children: [{ text: 'Launch plan includes' }] },
    ])
    const index = createPlateDocumentCompletionIndex(editor)
    index.hydrate()
    expect(queryAtSelection(index, editor)).toEqual([])

    editor.tf.insertNodes(
      {
        id: 'reference',
        type: 'p',
        children: [{ text: 'Launch plan includes staged rollout.' }],
      },
      { at: [0] },
    )
    editor.tf.select({
      anchor: { path: [1, 0], offset: 'Launch plan includes'.length },
      focus: { path: [1, 0], offset: 'Launch plan includes'.length },
    })
    index.syncEditorChanges()

    expect(queryAtSelection(index, editor)[0]?.text).toBe(' staged rollout.')
    index.destroy()
  })

  it('does not offer completions from code blocks or tables', () => {
    const editor = createEditor([
      {
        id: 'code',
        type: 'code_block',
        children: [{ text: 'Secret sequence continues from code.' }],
      },
      {
        id: 'table',
        type: 'table',
        children: [
          {
            type: 'tr',
            children: [
              {
                type: 'td',
                children: [
                  { type: 'p', children: [{ text: 'Secret sequence continues from table.' }] },
                ],
              },
            ],
          },
        ],
      },
      { id: 'active', type: 'p', children: [{ text: 'Secret sequence continues' }] },
    ])
    const index = createPlateDocumentCompletionIndex(editor)

    index.hydrate()

    expect(queryAtSelection(index, editor)).toEqual([])
    index.destroy()
  })

  it('infers a distant heading section from the active block scope', () => {
    const filler = Array.from({ length: 257 }, (_, item) => ({
      id: `filler-${item}`,
      type: 'p',
      children: [{ text: `Unrelated filler ${item}.` }],
    }))
    const editor = createEditor([
      { id: 'heading', type: 'h2', children: [{ text: 'Roadmap' }] },
      {
        id: 'reference',
        type: 'p',
        children: [{ text: 'Deploy service with canary checks.' }],
      },
      ...filler,
      { id: 'active', type: 'p', children: [{ text: 'Deploy service' }] },
    ])
    const index = createPlateDocumentCompletionIndex(editor)
    const context = buildPlateInlineCompletionContext(editor)
    expect(context?.heading).toBeNull()

    index.hydrate()

    expect(queryAtSelection(index, editor)[0]?.text).toBe(' with canary checks.')
    index.destroy()
  })

  it('ranks a nearby continuation using the full offset of a long block', () => {
    const text = [
      'Padding filler.\n'.repeat(80),
      'Choice continues with distant option.\n',
      'Buffer filler.\n'.repeat(100),
      'Choice continues with nearby option.\n',
      'Tail filler.\n'.repeat(30),
      'Choice continues with',
    ].join('')
    const editor = createEditor([{ id: 'long-active', type: 'p', children: [{ text }] }])
    const index = createPlateDocumentCompletionIndex(editor)
    const context = buildPlateInlineCompletionContext(editor)
    if (!context) throw new Error('Expected a completion context')
    expect(context.before).toHaveLength(1_200)
    expect(context.blockOffset).toBe(text.length)

    index.hydrate()

    expect(index.query({ ...context, blockOffset: context.before.length })[0]?.text).toBe(
      ' distant option.',
    )
    expect(queryAtSelection(index, editor)[0]?.text).toBe(' nearby option.')
    index.destroy()
  })
})
