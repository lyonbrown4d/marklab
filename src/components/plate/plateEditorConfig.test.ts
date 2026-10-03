import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderPlateEditorChunk } from '@/components/plate/plateEditorConfig'

describe('Plate editor chunk rendering', () => {
  it('gives lowest chunks a stable intrinsic block size for offscreen layout', () => {
    const child = createElement('p', null, 'Chunk')
    const chunk = renderPlateEditorChunk({
      attributes: { 'data-slate-chunk': true },
      children: child,
      highest: false,
      lowest: true,
    })

    expect(chunk).toMatchObject({
      props: {
        'data-slate-chunk': true,
        children: child,
        style: {
          containIntrinsicBlockSize: 'auto 800px',
          contentVisibility: 'auto',
        },
      },
      type: 'div',
    })
  })

  it('does not add containment wrappers to intermediate chunks', () => {
    const child = createElement('p', null, 'Chunk')

    expect(
      renderPlateEditorChunk({
        attributes: { 'data-slate-chunk': true },
        children: child,
        highest: true,
        lowest: false,
      }),
    ).toBe(child)
  })
})
