import type { TElement } from 'platejs'
import type { PlateEditor } from 'platejs/react'

export const blockActionTypes = ['p', 'h1', 'h2', 'h3', 'blockquote'] as const

export type BlockActionType = (typeof blockActionTypes)[number]
export type BlockAction =
  | { kind: 'delete' | 'duplicate' | 'moveDown' | 'moveUp' }
  | { kind: 'setType'; type: BlockActionType }

export type BlockClipboardAction = { kind: 'copy' | 'copyAsMarkdown' | 'cut' }
export type BlockMenuAction = BlockAction | BlockClipboardAction

export const isBlockClipboardAction = (action: BlockMenuAction): action is BlockClipboardAction =>
  action.kind === 'copy' || action.kind === 'copyAsMarkdown' || action.kind === 'cut'

export type BlockActionAvailability = {
  canMoveDown: boolean
  canMoveUp: boolean
  canSetType: boolean
}

const convertibleBlockTypes = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'])

const topLevelPath = (editor: PlateEditor, element: TElement) => {
  const path = editor.api.findPath(element)
  return path?.length === 1 ? path : undefined
}

export const getBlockActionAvailability = (
  editor: PlateEditor,
  element: TElement,
): BlockActionAvailability => {
  const path = topLevelPath(editor, element)
  if (!path) return { canMoveDown: false, canMoveUp: false, canSetType: false }

  return {
    canMoveDown: path[0] < editor.children.length - 1,
    canMoveUp: path[0] > 0,
    canSetType: convertibleBlockTypes.has(String(element.type)),
  }
}

export const runBlockAction = (
  editor: PlateEditor,
  element: TElement,
  action: BlockAction,
): TElement | undefined => {
  const path = topLevelPath(editor, element)
  if (!path) return
  const index = path[0]

  if (action.kind === 'setType') {
    if (!convertibleBlockTypes.has(String(element.type))) return
    editor.tf.withNewBatch(() => editor.tf.setNodes({ type: action.type }, { at: path }))
    return editor.children[index] as TElement | undefined
  }
  if (action.kind === 'duplicate') {
    editor.tf.withNewBatch(() =>
      editor.tf.insertNodes(structuredClone(element), { at: [index + 1] }),
    )
    return editor.children[index + 1] as TElement | undefined
  }
  if (action.kind === 'moveUp') {
    if (index === 0) return
    editor.tf.withNewBatch(() => editor.tf.moveNodes({ at: path, to: [index - 1] }))
    return editor.children[index - 1] as TElement | undefined
  }
  if (action.kind === 'moveDown') {
    if (index >= editor.children.length - 1) return
    editor.tf.withNewBatch(() => editor.tf.moveNodes({ at: path, to: [index + 1] }))
    return editor.children[index + 1] as TElement | undefined
  }

  if (editor.children.length === 1) {
    editor.tf.withNewBatch(() => {
      editor.tf.withoutNormalizing(() => {
        editor.tf.removeNodes({ at: path })
        editor.tf.insertNodes({ children: [{ text: '' }], type: 'p' }, { at: [0] })
      })
    })
    return editor.children[0] as TElement | undefined
  }
  const focusTarget = (editor.children[index + 1] ?? editor.children[index - 1]) as TElement
  editor.tf.withNewBatch(() => editor.tf.removeNodes({ at: path }))
  return focusTarget
}
