import { deserializeMd, serializeMd } from '@platejs/markdown'
import { createPlateEditor } from 'platejs/react'
import type { TElement } from 'platejs'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'

const createEditor = (markdown: string) =>
  createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: (editor) => deserializeMd(editor, markdown),
  })

describe('GFM table alignment rules', () => {
  it('maps nullable column alignment onto header and body cells', () => {
    const editor = createEditor(
      ['| Plain | Center | Right |', '| --- | :---: | ---: |', '| a | b | c |'].join('\n'),
    )
    const table = editor.children[0] as TElement

    expect(table.children).toEqual([
      expect.objectContaining({
        children: [
          expect.not.objectContaining({ align: expect.anything() }),
          expect.objectContaining({ align: 'center' }),
          expect.objectContaining({ align: 'right' }),
        ],
      }),
      expect.objectContaining({
        children: [
          expect.not.objectContaining({ align: expect.anything() }),
          expect.objectContaining({ align: 'center' }),
          expect.objectContaining({ align: 'right' }),
        ],
      }),
    ])
  })

  it('serializes column alignment from uneven header and body rows', () => {
    const editor = createEditor('| A | B | C |\n| --- | --- | --- |\n| a | b | c |')
    const table = editor.children[0] as TElement
    const rows = table.children as TElement[]
    const headerCells = rows[0].children as TElement[]
    const bodyCells = rows[1].children as TElement[]
    headerCells[0].align = 'left'
    headerCells[1].align = 'center'
    headerCells[2].align = 'right'
    rows[1].children = bodyCells.slice(0, 2)

    const markdown = serializeMd(editor)

    expect(markdown).toContain('| :- | :-: | -: |')
  })

  it('round trips left, center, right and unaligned columns', () => {
    const markdown = [
      '| Left | Center | Right | Plain |',
      '| :--- | :---: | ---: | --- |',
      '| a | b | c | d |',
    ].join('\n')

    const first = createEditor(markdown)
    const second = createEditor(serializeMd(first))

    expect(second.children).toEqual(first.children)
  })
})
