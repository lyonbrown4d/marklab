import type { Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type { RefObject } from 'react'
import { isEqualWith } from 'lodash-es'

export const resetPlateEditorHydrationState = (editor: PlateEditor) => {
  editor.selection = null
  editor.operations = []
  editor.marks = null
  if (editor.history) {
    editor.history.undos = []
    editor.history.redos = []
  }
}

const applyEditorValue = (
  editor: PlateEditor,
  apply: () => void,
  externalApplyRef?: RefObject<boolean>,
) => {
  if (externalApplyRef) externalApplyRef.current = true
  try {
    apply()
    resetPlateEditorHydrationState(editor)
    editor.api.onChange()
  } finally {
    if (externalApplyRef) externalApplyRef.current = false
  }
}

const applyAsyncEditorValue = async (apply: () => void, externalApplyRef?: RefObject<boolean>) => {
  if (externalApplyRef) externalApplyRef.current = true
  try {
    apply()
  } finally {
    await Promise.resolve()
    if (externalApplyRef) externalApplyRef.current = false
  }
}

export const replacePlateEditorValue = (
  editor: PlateEditor,
  value: Value,
  externalApplyRef?: RefObject<boolean>,
) => applyEditorValue(editor, () => (editor.children = value), externalApplyRef)

export const appendPlateEditorValue = (
  editor: PlateEditor,
  value: Value,
  firstChunk: boolean,
  externalApplyRef?: RefObject<boolean>,
) =>
  applyAsyncEditorValue(() => {
    if (firstChunk) editor.children = value
    else editor.children.push(...value)
    editor.api.onChange()
  }, externalApplyRef)

export const commitPlateEditorHydrationState = (
  editor: PlateEditor,
  externalApplyRef?: RefObject<boolean>,
) =>
  applyAsyncEditorValue(() => {
    resetPlateEditorHydrationState(editor)
    editor.api.onChange()
  }, externalApplyRef)

export const restorePlateEditorValue = (
  editor: PlateEditor,
  value: Value,
  externalApplyRef?: RefObject<boolean>,
) =>
  applyAsyncEditorValue(() => {
    editor.children = value
    resetPlateEditorHydrationState(editor)
    editor.api.onChange()
  }, externalApplyRef)

const plateNodesEqual = (current: unknown, next: unknown) =>
  isEqualWith(current, next, (_current, _next, key) => (key === 'id' ? true : undefined))

type TextPatch = { path: number[]; previousText: string; text: string }
type TextOperation = {
  offset: number
  path: number[]
  text: string
  type: 'insert_text' | 'remove_text'
}

const MAX_TEXT_PATCHES_PER_BLOCK = 64

const comparableNodeProperties = (node: Record<string, unknown>, omitted: string[]) =>
  Object.fromEntries(Object.entries(node).filter(([key]) => !omitted.includes(key)))

const collectTextPatches = (
  current: unknown,
  next: unknown,
  path: number[],
  patches: TextPatch[],
): boolean => {
  if (plateNodesEqual(current, next)) return true
  if (!current || !next || typeof current !== 'object' || typeof next !== 'object') return false

  const currentNode = current as Record<string, unknown>
  const nextNode = next as Record<string, unknown>
  const currentChildren = currentNode.children
  const nextChildren = nextNode.children
  if (Array.isArray(currentChildren) || Array.isArray(nextChildren)) {
    if (
      !Array.isArray(currentChildren) ||
      !Array.isArray(nextChildren) ||
      currentChildren.length !== nextChildren.length ||
      !plateNodesEqual(
        comparableNodeProperties(currentNode, ['children', 'id']),
        comparableNodeProperties(nextNode, ['children', 'id']),
      )
    ) {
      return false
    }
    return currentChildren.every((child, index) =>
      collectTextPatches(child, nextChildren[index], [...path, index], patches),
    )
  }

  if (
    typeof currentNode.text !== 'string' ||
    typeof nextNode.text !== 'string' ||
    !plateNodesEqual(
      comparableNodeProperties(currentNode, ['id', 'text']),
      comparableNodeProperties(nextNode, ['id', 'text']),
    )
  ) {
    return false
  }
  patches.push({ path, previousText: currentNode.text, text: nextNode.text })
  return true
}

export const reconcilePlateEditorValue = (current: Value, next: Value, offset: number): Value =>
  next.map((node, index) => {
    const currentNode = current[offset + index]
    return currentNode && plateNodesEqual(currentNode, node) ? currentNode : node
  })

export const patchPlateEditorValue = async (
  editor: PlateEditor,
  value: Value,
  offset: number,
  externalApplyRef?: RefObject<boolean>,
): Promise<boolean> => {
  const changed = value.some((node, index) => editor.children[offset + index] !== node)
  if (!changed) return false
  if (externalApplyRef) externalApplyRef.current = true
  try {
    const operationEditor = editor as unknown as { apply: (operation: TextOperation) => void }
    editor.tf.withoutNormalizing(() => {
      value.forEach((node, index) => {
        const path = [offset + index]
        const currentNode = editor.children[path[0]]
        if (currentNode === node) return
        const textPatches: TextPatch[] = []
        if (
          collectTextPatches(currentNode, node, path, textPatches) &&
          textPatches.length <= MAX_TEXT_PATCHES_PER_BLOCK
        ) {
          textPatches.forEach((patch) => {
            if (patch.previousText) {
              operationEditor.apply({
                offset: 0,
                path: patch.path,
                text: patch.previousText,
                type: 'remove_text',
              })
            }
            if (patch.text) {
              operationEditor.apply({
                offset: 0,
                path: patch.path,
                text: patch.text,
                type: 'insert_text',
              })
            }
          })
          return
        }
        if (editor.children[path[0]]) editor.tf.removeNodes({ at: path })
        editor.tf.insertNodes(node, { at: path })
      })
    })
    return true
  } finally {
    await Promise.resolve()
    if (externalApplyRef) externalApplyRef.current = false
  }
}

export const finalizePatchedPlateEditorValue = async (
  editor: PlateEditor,
  length: number,
  externalApplyRef?: RefObject<boolean>,
): Promise<boolean> => {
  if (editor.children.length === length) return false
  if (externalApplyRef) externalApplyRef.current = true
  try {
    editor.tf.withoutNormalizing(() => {
      for (let index = editor.children.length - 1; index >= length; index -= 1) {
        editor.tf.removeNodes({ at: [index] })
      }
    })
    return true
  } finally {
    await Promise.resolve()
    if (externalApplyRef) externalApplyRef.current = false
  }
}

export const splitPlateHydrationChunk = (value: Value, maxNodes = 12) => {
  const chunks: Value[] = []
  for (let index = 0; index < value.length; index += maxNodes) {
    chunks.push(value.slice(index, index + maxNodes))
  }
  return chunks.length > 0 ? chunks : [[]]
}

export const yieldToPlateHydrationTask = () =>
  new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(finish, 50)
    window.requestAnimationFrame(finish)
  })
