import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import type { ShortcutActionId } from '@/logic/shortcuts'
import {
  getFirstChildHeadingId,
  getFirstHeadingId,
  getLastHeadingId,
  getNextHeadingId,
  getParentHeadingId,
  getPreviousHeadingId,
} from '@/logic/graphKeyboardNavigation'

export type GraphHotkeyAction =
  | 'add-child'
  | 'add-sibling'
  | 'add-sibling-before'
  | 'clear-selection'
  | 'delete'
  | 'edit-title'
  | 'collapse'
  | 'collapse-subtree'
  | 'expand'
  | 'expand-subtree'
  | 'fit-view'
  | 'focus-selection'
  | 'navigate-child'
  | 'navigate-down'
  | 'navigate-parent'
  | 'navigate-up'
  | 'zoom-in'
  | 'zoom-out'

export const graphShortcutActions = [
  ['graph.addSibling', 'add-sibling'],
  ['graph.addSiblingBefore', 'add-sibling-before'],
  ['graph.addChild', 'add-child'],
  ['graph.delete', 'delete'],
  ['graph.editTitle', 'edit-title'],
  ['graph.selectPrevious', 'navigate-up'],
  ['graph.selectNext', 'navigate-down'],
  ['graph.selectParent', 'navigate-parent'],
  ['graph.selectChild', 'navigate-child'],
  ['graph.clearSelection', 'clear-selection'],
  ['graph.focusSelection', 'focus-selection'],
  ['graph.fitView', 'fit-view'],
  ['graph.zoomIn', 'zoom-in'],
  ['graph.zoomOut', 'zoom-out'],
  ['graph.collapse', 'collapse'],
  ['graph.expand', 'expand'],
  ['graph.collapseSubtree', 'collapse-subtree'],
  ['graph.expandSubtree', 'expand-subtree'],
] as const satisfies ReadonlyArray<readonly [ShortcutActionId, GraphHotkeyAction]>

export const getKeyboardNavigationTarget = (
  action: GraphHotkeyAction,
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  selectedHeadingId: string,
) => {
  if (action === 'navigate-up') return getPreviousHeadingId(nodes, selectedHeadingId)
  if (action === 'navigate-down') return getNextHeadingId(nodes, selectedHeadingId)
  if (action === 'navigate-parent') return getParentHeadingId(nodes, edges, selectedHeadingId)
  if (action === 'navigate-child') return getFirstChildHeadingId(nodes, edges, selectedHeadingId)
  return undefined
}

export const getInitialKeyboardNavigationTarget = (
  action: GraphHotkeyAction,
  nodes: Node<GraphNodeData>[],
) => {
  if (action === 'navigate-up') return getLastHeadingId(nodes)
  if (action === 'navigate-down') return getFirstHeadingId(nodes)
  return null
}

export const preventGraphHotkeyDefault = (event: KeyboardEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

export const isTextEditingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export const selectElementText = (element: HTMLElement) => {
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  selection?.removeAllRanges()
  selection?.addRange(range)
}
