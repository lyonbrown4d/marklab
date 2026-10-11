import { useCallback, useEffect } from 'react'
import type { PlateEditor } from 'platejs/react'
import { clearActiveHeading, setActiveHeading } from '@/utils/editorNavigation'
import {
  buildPlateHeadingIndex,
  findPlateActiveHeading,
  type PlateHeadingIndexEntry,
} from '@/components/plate/plateDocumentHeadingIndex'

const headingIndexes = new WeakMap<PlateEditor, readonly PlateHeadingIndexEntry[]>()
type PlateOperation = {
  newPath?: number[]
  newProperties?: Record<string, unknown>
  node?: unknown
  path?: number[]
  properties?: Record<string, unknown>
  type: string
}

const isHeadingNode = (node: unknown) => {
  if (!node || typeof node !== 'object' || !('type' in node)) return false
  return typeof node.type === 'string' && /^h[1-6]$/u.test(node.type)
}

const pathTouchesHeading = (editor: PlateEditor, path?: readonly number[]) => {
  const blockIndex = path?.[0]
  return typeof blockIndex === 'number' && isHeadingNode(editor.children[blockIndex])
}

const isTopLevelPath = (path?: readonly number[]) => path?.length === 1

const operationChangesHeadingIndex = (editor: PlateEditor, operation: PlateOperation) => {
  if (operation.type === 'set_selection') return false
  if (operation.type === 'insert_text' || operation.type === 'remove_text') {
    return pathTouchesHeading(editor, operation.path)
  }
  if (operation.type === 'set_node') {
    return (
      isHeadingNode(operation.properties) ||
      isHeadingNode(operation.newProperties) ||
      (isTopLevelPath(operation.path) && pathTouchesHeading(editor, operation.path))
    )
  }
  if (
    operation.type === 'insert_node' ||
    operation.type === 'merge_node' ||
    operation.type === 'move_node' ||
    operation.type === 'remove_node' ||
    operation.type === 'split_node'
  ) {
    return (
      isTopLevelPath(operation.path) ||
      isTopLevelPath(operation.newPath) ||
      pathTouchesHeading(editor, operation.path) ||
      pathTouchesHeading(editor, operation.newPath) ||
      isHeadingNode(operation.node)
    )
  }
  return true
}

export const getPlateActiveHeading = (editor: PlateEditor) => {
  const blockIndex = editor.selection?.focus.path[0]
  if (typeof blockIndex !== 'number' || blockIndex < 0) return null
  let index = headingIndexes.get(editor)
  if (!index) {
    index = buildPlateHeadingIndex(editor.children)
    headingIndexes.set(editor, index)
  }
  return findPlateActiveHeading(index, blockIndex)
}

export const invalidatePlateHeadingIndex = (editor: PlateEditor) => {
  headingIndexes.delete(editor)
}

export const invalidateChangedPlateHeadingIndex = (
  editor: PlateEditor,
  forceEmptyOperationBatch = false,
) => {
  const operations = editor.operations as PlateOperation[]
  const shouldInvalidate =
    (forceEmptyOperationBatch && operations.length === 0) ||
    operations.some((operation) => operationChangesHeadingIndex(editor, operation))
  if (shouldInvalidate) invalidatePlateHeadingIndex(editor)
  return shouldInvalidate
}

export const getPlateActiveHeadingSlug = (editor: PlateEditor): string | null =>
  getPlateActiveHeading(editor)?.slug ?? null

export const usePlateActiveHeading = (
  activePath: string | null,
  editor: PlateEditor,
  enabled: boolean,
) => {
  const syncActiveHeading = useCallback(() => {
    if (!activePath || !enabled) return
    setActiveHeading(activePath, getPlateActiveHeading(editor))
  }, [activePath, editor, enabled])

  useEffect(() => {
    if (!activePath) return
    if (enabled) syncActiveHeading()
    else clearActiveHeading(activePath)

    return () => clearActiveHeading(activePath)
  }, [activePath, enabled, syncActiveHeading])

  return syncActiveHeading
}
