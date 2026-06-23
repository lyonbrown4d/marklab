import { describe, expect, it } from 'vitest'

import {
  embeddedLinksInTextNode,
  markdownEmbeddedLinksInText,
} from '@/components/milkdown/embeddedPreviewPlugin'

const linkType = Symbol('link')

describe('embeddedPreviewPlugin', () => {
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
