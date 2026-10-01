import { describe, expect, it, vi } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'

import {
  changedTextblockRanges,
  embeddedLinksInTextNode,
  markdownEmbeddedLinksInText,
} from '@/components/milkdown/embeddedPreviewPlugin'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const linkType = Symbol('link')

describe('embeddedPreviewPlugin', () => {
  it('limits decoration rescans to the text block changed by a transaction', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*' },
        text: {},
      },
    })
    const first = schema.node('paragraph', null, schema.text('First paragraph'))
    const second = schema.node('paragraph', null, schema.text('Second paragraph'))
    const state = EditorState.create({ doc: schema.node('doc', null, [first, second]), schema })
    const transaction = state.tr.insertText('!', 2)
    const nextState = state.apply(transaction)

    expect(changedTextblockRanges(transaction)).toEqual([
      { from: 0, to: nextState.doc.child(0).nodeSize },
    ])
  })

  it('extracts unicode pdf targets from plain markdown links', () => {
    expect(markdownEmbeddedLinksInText('[pdf](./新疆观山海--授权书.pdf)')).toEqual([
      {
        href: './新疆观山海--授权书.pdf',
        title: 'pdf',
      },
    ])
  })

  it('falls back to markdown text when a link mark is not present', () => {
    const seen = new Set<string>()

    expect(
      embeddedLinksInTextNode(
        {
          marks: [],
          text: '[pdf](./新疆观山海--授权书.pdf)',
        },
        linkType,
        seen,
      ),
    ).toEqual([
      {
        href: './新疆观山海--授权书.pdf',
        title: 'pdf',
      },
    ])
  })

  it('deduplicates mark and markdown fallback links', () => {
    const seen = new Set<string>()

    expect(
      embeddedLinksInTextNode(
        {
          marks: [
            {
              attrs: { href: './新疆观山海--授权书.pdf', title: '授权书' },
              type: linkType,
            },
          ],
          text: '[pdf](./新疆观山海--授权书.pdf)',
        },
        linkType,
        seen,
      ),
    ).toEqual([
      {
        href: './新疆观山海--授权书.pdf',
        title: '授权书',
      },
    ])
  })
})
