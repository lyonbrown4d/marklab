import type { Edge, Node } from '@xyflow/react'
import type { RegisterableHotkey, UseHotkeyDefinition } from '@tanstack/react-hotkeys'
import type { GraphNodeData } from '@/logic/graph'
import {
  resolveShortcutBindings,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'
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

type GraphHotkeyBinding = Omit<UseHotkeyDefinition, 'callback'> & {
  action: GraphHotkeyAction
}

export const createGraphHotkeyBindings = (
  shortcutOverrides: ShortcutBindings,
): GraphHotkeyBinding[] => {
  const bindings = resolveShortcutBindings(shortcutOverrides)
  return graphShortcutActions.flatMap(([shortcutAction, graphAction]) =>
    bindings[shortcutAction].map((hotkey) => ({
      action: graphAction,
      hotkey: hotkey as RegisterableHotkey,
      options: {
        enabled: true,
        meta: { name: shortcutAction },
      },
    })),
  )
}

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
  const element = getTargetElement(target)
  return Boolean(
    element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
  )
}

const getTargetElement = (target: EventTarget | null) =>
  target instanceof Element
    ? target
    : target instanceof globalThis.Node
      ? target.parentElement
      : null

const isGraphInteractiveTarget = (target: EventTarget | null) =>
  isTextEditingTarget(target) ||
  Boolean(
    getTargetElement(target)?.closest(
      'button, a[href], summary, dialog, [role="button"]:not(.react-flow__node), ' +
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="menubar"], ' +
        '[role="menuitem"], [role="listbox"], [role="combobox"], [role="textbox"], ' +
        '[role="checkbox"], [role="radio"], [role="switch"], [role="slider"], ' +
        '[role="tab"], [data-radix-popper-content-wrapper]',
    ),
  )

export const isGraphCanvasEvent = (event: Event, shell: HTMLElement | null) =>
  event.target instanceof globalThis.Node &&
  Boolean(shell?.contains(event.target)) &&
  !isGraphInteractiveTarget(event.target) &&
  !event.composedPath().some(isGraphInteractiveTarget)

export const selectElementText = (element: HTMLElement) => {
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  selection?.removeAllRanges()
  selection?.addRange(range)
}
