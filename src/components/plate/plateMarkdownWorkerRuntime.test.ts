import {
  ElementApi as plateElementApi,
  KEYS as plateKeys,
  TextApi as plateTextApi,
  getPluginKey as plateGetPluginKey,
  getPluginType as plateGetPluginType,
  type SlateEditor,
} from 'platejs'
import { describe, expect, it } from 'vitest'
import {
  ElementApi,
  KEYS,
  PathApi,
  TextApi,
  bindFirst,
  createSlatePlugin,
  createTSlatePlugin,
  getPluginKey,
  getPluginType,
  isUrl,
} from '@/components/plate/plateMarkdownWorkerRuntime'

const createEditorContract = () =>
  ({
    getPlugin: ({ key }: { key: string }) => ({ key, node: { type: `node:${key}` } }),
    meta: {
      pluginCache: {
        node: { types: { paragraph: 'p' } },
      },
    },
  }) as unknown as SlateEditor

describe('Plate Markdown worker runtime facade', () => {
  it('uses the canonical Plate keys and Slate node predicates', () => {
    const values = [
      { children: [{ text: '' }], type: 'p' },
      { bold: true, text: 'text' },
      { text: 3 },
      null,
    ]

    expect(KEYS).toBe(plateKeys)
    expect(values.map(ElementApi.isElement)).toEqual(values.map(plateElementApi.isElement))
    expect(values.map(TextApi.isText)).toEqual(values.map(plateTextApi.isText))
  })

  it('matches Plate plugin key and type lookups', () => {
    const editor = createEditorContract()

    expect(getPluginKey(editor, 'paragraph')).toBe(plateGetPluginKey(editor, 'paragraph'))
    expect(getPluginKey(editor, undefined)).toBeUndefined()
    expect(getPluginType(editor, 'paragraph')).toBe(plateGetPluginType(editor, 'paragraph'))
  })

  it('falls back from an absent plugin node type to its key and then an empty type', () => {
    const keyed = {
      getPlugin: () => ({ key: 'paragraph', node: {} }),
    } as unknown as SlateEditor
    const anonymous = {
      getPlugin: () => ({ node: {} }),
    } as unknown as SlateEditor

    expect(getPluginType(keyed, 'paragraph')).toBe('paragraph')
    expect(getPluginType(anonymous, 'paragraph')).toBe('')
  })

  it.each([
    ['bindFirst', () => bindFirst()],
    ['createSlatePlugin', () => createSlatePlugin()],
    ['createTSlatePlugin', () => createTSlatePlugin()],
    ['isUrl', () => isUrl()],
    ['PathApi.next', () => PathApi.next()],
    ['PathApi.previous', () => PathApi.previous()],
  ])('fails fast when unsupported static import %s is called', (api, call) => {
    expect(call).toThrow(
      `Plate API "${api}" is unavailable in the Markdown worker runtime. ` +
        'Update the worker compatibility boundary before using it.',
    )
  })
})
