import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { getPlateSlashTrigger } from '@/components/plate/slash/plateSlashCommands'
import { capturePlateSlashUrlInsertion } from '@/components/plate/slash/plateSlashUrlInsertion'

const createEditor = (text: string) => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text }] }],
  })
  editor.selection = {
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  }
  return editor
}

describe('Plate slash URL insertion', () => {
  it('replaces the slash query with a relative-path link', () => {
    const editor = createEditor('/link')
    const request = capturePlateSlashUrlInsertion(editor, 'link', getPlateSlashTrigger(editor)!)

    request.insert({ text: 'Guide', url: '../docs/guide.md' })

    expect(editor.api.string([])).toBe('Guide')
    expect(editor.api.rangeRefs()).toHaveLength(0)
    expect(editor.children[0]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({
          children: [{ text: 'Guide' }],
          type: 'a',
          url: '../docs/guide.md',
        }),
      ]),
    })
  })

  it('inserts an image with literal alt text', () => {
    const editor = createEditor('/image')
    const request = capturePlateSlashUrlInsertion(
      editor,
      'image-url',
      getPlateSlashTrigger(editor)!,
    )

    request.insert({ text: '<diagram>', url: './diagram.png' })

    expect(editor.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alt: '<diagram>', type: 'img', url: './diagram.png' }),
      ]),
    )
  })

  it('rejects empty destinations and invalidated insertion targets', () => {
    const editor = createEditor('/link')
    const request = capturePlateSlashUrlInsertion(editor, 'link', getPlateSlashTrigger(editor)!)

    expect(() => request.insert({ text: '', url: '  ' })).toThrow('A URL is required')
    request.invalidate()
    expect(() => request.insert({ text: '', url: './later.md' })).toThrow('no longer current')
    expect(editor.api.string([])).toBe('/link')
  })

  it('releases the captured target after restoring editor focus', () => {
    const editor = createEditor('/link')
    const request = capturePlateSlashUrlInsertion(editor, 'link', getPlateSlashTrigger(editor)!)

    expect(editor.api.rangeRefs()).toHaveLength(1)
    request.restoreFocus()

    expect(editor.api.rangeRefs()).toHaveLength(0)
    expect(() => request.insert({ text: 'Guide', url: './guide.md' })).toThrow('no longer current')
  })

  it.each(['javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>'])(
    'rejects the unsafe link destination %s',
    (url) => {
      const editor = createEditor('/link')
      const request = capturePlateSlashUrlInsertion(editor, 'link', getPlateSlashTrigger(editor)!)

      expect(() => request.insert({ text: 'Unsafe', url })).toThrow('not allowed')
      expect(editor.api.string([])).toBe('/link')
    },
  )
})
