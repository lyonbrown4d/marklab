import { Schema, type Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { describe, expect, it, vi } from 'vitest'
import {
  buildAiInlineCompletionContext,
  buildAiInlineCompletionLocalContext,
  isAiInlineCompletionSelectionEligible,
} from '@/components/milkdown/aiInlineCompletionContext'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    heading: { attrs: { level: { default: 1 } }, content: 'text*', group: 'block' },
    code_block: { content: 'text*', group: 'block', code: true },
    frontmatter: { content: 'text*', group: 'block' },
    table: { content: 'table_row+', group: 'block' },
    table_row: { content: 'table_cell+' },
    table_cell: { content: 'paragraph+' },
    text: { group: 'inline' },
  },
  marks: { inlineCode: {} },
})

const textBlock = (type: string, text: string) =>
  schema.node(type, type === 'heading' ? { level: 2 } : null, text ? schema.text(text) : undefined)

const paragraph = (text: string) => textBlock('paragraph', text)

const stateAtText = (doc: ProseMirrorNode, text: string, offset = text.length) => {
  let position = -1
  doc.descendants((node, pos) => {
    if (position < 0 && node.isTextblock && node.textContent === text) position = pos + 1 + offset
  })
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, position),
  })
}

describe('AI inline completion context', () => {
  it('collects the current text block, latest heading, and nearby blocks', () => {
    const doc = schema.node('doc', null, [
      textBlock('heading', 'Daily plan'),
      paragraph('Yesterday was quiet.'),
      paragraph('Today I plan to write.'),
      paragraph('Then review the notes.'),
    ])
    const state = stateAtText(doc, 'Today I plan to write.', 13)

    expect(buildAiInlineCompletionContext(state, { characterBudget: 200 })).toEqual({
      after: 'to write.',
      before: 'Today I plan ',
      followingBlocks: ['Then review the notes.'],
      heading: 'Daily plan',
      nodeType: 'paragraph',
      precedingBlocks: ['Yesterday was quiet.'],
    })
  })

  it('enforces a fixed total character budget', () => {
    const doc = schema.node('doc', null, [
      textBlock('heading', 'Heading that is deliberately long'),
      paragraph('Earlier paragraph that should be clipped'),
      paragraph('Current paragraph with text after the caret'),
      paragraph('Following paragraph that should be clipped'),
    ])
    const state = stateAtText(doc, 'Current paragraph with text after the caret', 17)
    const context = buildAiInlineCompletionContext(state, { characterBudget: 40 })
    const size = context
      ? [
          context.before,
          context.after,
          context.heading ?? '',
          ...context.precedingBlocks,
          ...context.followingBlocks,
        ].join('').length
      : 0

    expect(context).not.toBeNull()
    expect(size).toBeLessThanOrEqual(40)
    expect(context?.before).toBe('Current paragraph')
  })

  it('builds local candidates from only the current textblock', () => {
    const doc = schema.node('doc', null, [
      textBlock('heading', 'Heading'),
      paragraph('Previous context'),
      paragraph('Current text'),
      paragraph('Following context'),
    ])
    const state = stateAtText(doc, 'Current text')
    const descendants = vi.spyOn(doc, 'descendants')

    expect(buildAiInlineCompletionLocalContext(state)).toEqual({
      after: '',
      before: 'Current text',
      followingBlocks: [],
      heading: null,
      nodeType: 'paragraph',
      precedingBlocks: [],
    })
    expect(descendants).not.toHaveBeenCalled()
  })

  it('bounds nearby context traversal instead of scanning the full document', () => {
    const paragraphs = Array.from({ length: 300 }, (_, index) => paragraph(`Block ${index}`))
    const doc = schema.node('doc', null, paragraphs)
    const state = stateAtText(doc, 'Block 150')
    const nodesBetween = vi.spyOn(doc, 'nodesBetween')

    buildAiInlineCompletionContext(state, { characterBudget: 80 })

    expect(nodesBetween).toHaveBeenCalled()
    const [from, to] = nodesBetween.mock.calls[0] ?? []
    expect(Number(to) - Number(from)).toBeLessThan(doc.content.size)
  })

  it.each(['code_block', 'frontmatter'])('rejects a caret inside %s', (nodeType) => {
    const doc = schema.node('doc', null, [textBlock(nodeType, 'secret')])
    expect(isAiInlineCompletionSelectionEligible(stateAtText(doc, 'secret'))).toBe(false)
  })

  it('rejects tables and non-empty selections', () => {
    const cell = schema.node('table_cell', null, [paragraph('cell')])
    const doc = schema.node('doc', null, [
      schema.node('table', null, [schema.node('table_row', null, [cell])]),
    ])
    expect(isAiInlineCompletionSelectionEligible(stateAtText(doc, 'cell'))).toBe(false)

    const plainDoc = schema.node('doc', null, [paragraph('select me')])
    const selected = EditorState.create({
      doc: plainDoc,
      selection: TextSelection.create(plainDoc, 1, 4),
    })
    expect(isAiInlineCompletionSelectionEligible(selected)).toBe(false)
  })

  it('rejects a caret inside inline code', () => {
    const inlineCode = schema.marks.inlineCode.create()
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('inline code', [inlineCode])),
    ])

    expect(isAiInlineCompletionSelectionEligible(stateAtText(doc, 'inline code', 4))).toBe(false)
  })
})
