import type { SlateEditor } from 'platejs'

export { KEYS } from 'platejs'

type ElementShape = { children: unknown[] }
type TextShape = { text: string }

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null

const unsupportedPlateApi = (api: string): never => {
  throw new Error(
    `Plate API "${api}" is unavailable in the Markdown worker runtime. ` +
      'Update the worker compatibility boundary before using it.',
  )
}

export const ElementApi = {
  isElement: (value: unknown): value is ElementShape =>
    isRecord(value) && Array.isArray(value.children) && typeof value.apply !== 'function',
}

export const TextApi = {
  isText: (value: unknown): value is TextShape => isRecord(value) && typeof value.text === 'string',
}

export const getPluginKey = (editor: SlateEditor, type: string | undefined) =>
  type === undefined ? undefined : editor.meta.pluginCache.node.types[type]

export const getPluginType = (editor: SlateEditor, key: string) => {
  const plugin = editor.getPlugin({ key })
  return plugin.node.type ?? plugin.key ?? ''
}

// These names lock the facade to @platejs/markdown's current static import
// graph. Conversion code does not call them; a Plate upgrade must pass both
// the contract and worker-bundle tests before changing this boundary.
export const bindFirst = (): never => unsupportedPlateApi('bindFirst')
export const createSlatePlugin = (): never => unsupportedPlateApi('createSlatePlugin')
export const createTSlatePlugin = (): never => unsupportedPlateApi('createTSlatePlugin')
export const isUrl = (): never => unsupportedPlateApi('isUrl')

export const PathApi = {
  next: (): never => unsupportedPlateApi('PathApi.next'),
  previous: (): never => unsupportedPlateApi('PathApi.previous'),
}
