import { DndPlugin } from '@platejs/dnd'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import type { TElement } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { isImeKeyboardEvent } from '@/logic/ime'

export type BlockSelectionModifiers = {
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

type MoveDirection = 'down' | 'up'

type BlockKeyboardEvent = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'preventDefault' | 'shiftKey' | 'stopPropagation'
> & { isComposing?: boolean }

type SelectBlockOptions = {
  focusSelection: boolean
  preserveSelectedGroup: boolean
  toggleSoleSelection: boolean
}

const documentBlockIds = (editor: PlateEditor) =>
  editor.children.flatMap((node) => {
    const id = (node as TElement).id
    return typeof id === 'string' ? [id] : []
  })

const orderIds = (editor: PlateEditor, ids: Iterable<string>) => {
  const selected = new Set(ids)
  return documentBlockIds(editor).filter((id) => selected.has(id))
}

const syncDraggingIds = (editor: PlateEditor, ids: string[]) => {
  editor.setOption(DndPlugin, 'draggingId', ids.length === 1 ? ids[0] : ids)
}

export const setBlockSelectionTarget = (editor: PlateEditor, element: TElement) => {
  const api = editor.getApi(BlockSelectionPlugin).blockSelection
  const id = typeof element.id === 'string' ? element.id : undefined
  if (!id) {
    api.deselect()
    syncDraggingIds(editor, [])
    return
  }
  api.set([id])
  editor.setOption(BlockSelectionPlugin, 'anchorId', id)
  syncDraggingIds(editor, [id])
}

export const getFocusedTopLevelBlockId = (editor: PlateEditor) => {
  const index = editor.selection?.focus.path[0]
  if (index === undefined) return undefined
  const id = (editor.children[index] as TElement | undefined)?.id
  return typeof id === 'string' ? id : undefined
}

const selectBlock = (
  editor: PlateEditor,
  id: string,
  modifiers: BlockSelectionModifiers,
  options: SelectBlockOptions,
) => {
  const api = editor.getApi(BlockSelectionPlugin).blockSelection
  const selected = editor.getOptions(BlockSelectionPlugin).selectedIds ?? new Set<string>()
  const orderedIds = documentBlockIds(editor)
  if (!orderedIds.includes(id)) return []

  let nextIds: string[]
  if (modifiers.shiftKey) {
    const anchorId = editor.getOption(BlockSelectionPlugin, 'anchorId') ?? id
    const anchorIndex = orderedIds.indexOf(anchorId)
    const targetIndex = orderedIds.indexOf(id)
    const start = Math.min(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex)
    const end = Math.max(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex)
    nextIds = orderedIds.slice(start, end + 1)
    editor.setOption(BlockSelectionPlugin, 'anchorId', anchorId)
  } else if (modifiers.ctrlKey || modifiers.metaKey) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    nextIds = orderIds(editor, next)
    editor.setOption(BlockSelectionPlugin, 'anchorId', id)
  } else if (options.toggleSoleSelection && selected.has(id) && selected.size === 1) {
    nextIds = []
  } else if (options.preserveSelectedGroup && selected.has(id) && selected.size > 1) {
    nextIds = orderIds(editor, selected)
  } else {
    nextIds = [id]
    editor.setOption(BlockSelectionPlugin, 'anchorId', id)
  }

  if (nextIds.length > 0) api.set(nextIds)
  else api.deselect()
  syncDraggingIds(editor, nextIds)
  if (options.focusSelection) api.focus()
  return nextIds
}

export const selectBlockFromHandle = (
  editor: PlateEditor,
  id: string,
  modifiers: BlockSelectionModifiers,
) =>
  selectBlock(editor, id, modifiers, {
    focusSelection: true,
    preserveSelectedGroup: true,
    toggleSoleSelection: false,
  })

export const handlePlateBlockSelectionShortcut = (
  editor: PlateEditor,
  event: BlockKeyboardEvent,
  focusedBlockId: string,
) => {
  if (
    isImeKeyboardEvent({ isComposing: event.isComposing ?? false, key: event.key }) ||
    event.altKey ||
    event.key !== ' '
  ) {
    return false
  }

  selectBlock(editor, focusedBlockId, event, {
    focusSelection: false,
    preserveSelectedGroup: false,
    toggleSoleSelection: !event.ctrlKey && !event.metaKey && !event.shiftKey,
  })
  event.preventDefault()
  event.stopPropagation()
  return true
}

export const moveSelectedBlocks = (editor: PlateEditor, direction: MoveDirection) => {
  const api = editor.getApi(BlockSelectionPlugin).blockSelection
  const selectedIds = editor.getOptions(BlockSelectionPlugin).selectedIds ?? new Set<string>()
  const ids = orderIds(editor, selectedIds)
  if (ids.length === 0) return false
  const indexes = ids.map((id) => editor.children.findIndex((node) => (node as TElement).id === id))
  if (
    (direction === 'up' && Math.min(...indexes) === 0) ||
    (direction === 'down' && Math.max(...indexes) === editor.children.length - 1)
  ) {
    return false
  }

  const movingIds = direction === 'up' ? ids : [...ids].reverse()
  editor.tf.withoutNormalizing(() => {
    for (const id of movingIds) {
      const entry = editor.api.node({ at: [], id })
      if (!entry || entry[1].length !== 1) continue
      const index = entry[1][0]
      editor.tf.moveNodes({ at: entry[1], to: [index + (direction === 'up' ? -1 : 1)] })
    }
  })
  api.set(ids)
  syncDraggingIds(editor, ids)
  api.focus()
  return true
}

export const handlePlateBlockMoveShortcut = (
  editor: PlateEditor,
  event: BlockKeyboardEvent,
  focusedBlockId?: string,
) => {
  if (
    isImeKeyboardEvent({ isComposing: event.isComposing ?? false, key: event.key }) ||
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
  ) {
    return false
  }
  const api = editor.getApi(BlockSelectionPlugin).blockSelection
  const selectedIds = editor.getOptions(BlockSelectionPlugin).selectedIds
  if ((!selectedIds || selectedIds.size === 0) && focusedBlockId) api.set(focusedBlockId)
  if (!moveSelectedBlocks(editor, event.key === 'ArrowUp' ? 'up' : 'down')) return false
  event.preventDefault()
  event.stopPropagation()
  return true
}
