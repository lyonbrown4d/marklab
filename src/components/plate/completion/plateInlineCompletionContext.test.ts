import type { Value } from 'platejs'
import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { buildPlateInlineCompletionContext } from '@/components/plate/completion/plateInlineCompletionContext'

const createEditor = (value: Value) => createPlateEditor({ value })

describe('Plate inline completion context', () => {
  it('collects bounded nearby prose around a collapsed caret', () => {
    const editor = createEditor([
      { type: 'h2', children: [{ text: 'Plans' }] },
      { type: 'p', children: [{ text: 'Earlier note' }] },
      { type: 'p', children: [{ text: 'I plan to write tomorrow' }] },
      { type: 'p', children: [{ text: 'Following note' }] },
    ])
    editor.tf.select({
      anchor: { path: [2, 0], offset: 10 },
      focus: { path: [2, 0], offset: 10 },
    })

    expect(buildPlateInlineCompletionContext(editor)).toEqual({
      after: 'write tomorrow',
      before: 'I plan to ',
      blockId: 'block:2',
      blockOffset: 10,
      followingBlocks: ['Following note'],
      heading: 'Plans',
      nodeType: 'p',
      precedingBlocks: ['Earlier note'],
    })
  })

  it.each([
    [{ type: 'code_block', children: [{ text: 'const value = 1' }] }],
    [{ type: 'p', children: [{ code: true, text: 'inline code' }] }],
  ])('rejects code contexts and expanded selections', (block) => {
    const editor = createEditor([block])
    editor.tf.select({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    })
    expect(buildPlateInlineCompletionContext(editor)).toBeNull()

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 2 },
    })
    expect(buildPlateInlineCompletionContext(editor)).toBeNull()
  })

  it('does not treat an explicitly disabled code mark as inline code', () => {
    const editor = createEditor([{ type: 'p', children: [{ code: false, text: 'ordinary text' }] }])
    editor.tf.select({
      anchor: { path: [0, 0], offset: 8 },
      focus: { path: [0, 0], offset: 8 },
    })

    expect(buildPlateInlineCompletionContext(editor)?.before).toBe('ordinary')
  })

  it('keeps the full block UTF-16 offset when the before context is truncated', () => {
    const leadingText = 'a'.repeat(1_300)
    const editor = createEditor([
      {
        id: 'long-block',
        type: 'p',
        children: [{ text: leadingText }, { bold: true, text: '😀tail' }],
      },
    ])
    editor.tf.select({
      anchor: { path: [0, 1], offset: '😀'.length },
      focus: { path: [0, 1], offset: '😀'.length },
    })

    const context = buildPlateInlineCompletionContext(editor)

    expect(context?.before).toHaveLength(1_200)
    expect(context?.before.endsWith('😀')).toBe(true)
    expect(context?.blockOffset).toBe(1_302)
  })
})
