import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  deserializePlateMarkdown,
  serializePlateMarkdown,
} from '@/components/plate/plateMarkdownSerialization'

const createEditor = (markdown: string) =>
  createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: (instance) => deserializePlateMarkdown(instance, markdown),
  })

describe('Plate classic list compatibility', () => {
  it('keeps ordered task metadata when indenting and outdenting an item', () => {
    const markdown = ['3. [x] first', '4. [ ] second'].join('\n')
    const editor = createEditor(markdown)

    editor.tf.select({
      anchor: { offset: 0, path: [0, 1, 0, 0] },
      focus: { offset: 0, path: [0, 1, 0, 0] },
    })

    expect(editor.tf.tab({ reverse: false })).toBe(true)
    expect(editor.children[0]).toMatchObject({
      children: [
        {
          checked: true,
          children: [
            { type: 'lic' },
            {
              children: [{ checked: false, type: 'li' }],
              ordered: true,
              start: 1,
              type: 'taskList',
            },
          ],
          type: 'li',
        },
      ],
      ordered: true,
      start: 3,
      type: 'taskList',
    })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(
      ['3. [x] first', '', '   1. [ ] second'].join('\n'),
    )

    expect(editor.tf.tab({ reverse: true })).toBe(true)
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(markdown)
  })

  it('keeps plain items plain when normalizing a mixed ordered task list', () => {
    const editor = createEditor(['3. [x] task', '4. plain'].join('\n'))

    editor.tf.select({
      anchor: { offset: 4, path: [0, 0, 0, 0] },
      focus: { offset: 4, path: [0, 0, 0, 0] },
    })
    editor.tf.insertText('!')

    const list = editor.children[0] as { children: Array<Record<string, unknown>> }
    expect(list.children[0]).toMatchObject({ checked: true, type: 'li' })
    expect(list.children[1]).toMatchObject({ checked: null, type: 'li' })
    expect(serializePlateMarkdown(editor).trimEnd()).toBe(['3. [x] task!', '4. plain'].join('\n'))
  })
})
