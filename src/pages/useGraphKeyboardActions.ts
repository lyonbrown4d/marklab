import { useCallback, useMemo, type MouseEvent, type RefObject } from 'react'
import {
  useHotkeys,
  type RegisterableHotkey,
  type UseHotkeyDefinition,
} from '@tanstack/react-hotkeys'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { resolveShortcutBindings, type ShortcutActionId } from '@/logic/shortcuts'
import {
  getFirstChildHeadingId,
  getNextHeadingId,
  getParentHeadingId,
  getPreviousHeadingId,
} from '@/logic/graphKeyboardNavigation'
import { useAppStore } from '@/store/useAppStore'

type GraphHotkeyAction =
  | 'add-child'
  | 'add-sibling'
  | 'add-sibling-before'
  | 'clear-selection'
  | 'delete'
  | 'edit-title'
  | 'navigate-child'
  | 'navigate-down'
  | 'navigate-parent'
  | 'navigate-up'

const graphShortcutActions = [
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
] as const satisfies ReadonlyArray<readonly [ShortcutActionId, GraphHotkeyAction]>

type UseGraphKeyboardActionsArgs = {
  editable: boolean
  edges: Edge[]
  graphShellRef: RefObject<HTMLDivElement | null>
  nodes: Node<GraphNodeData>[]
  selectedHeadingId: string | null
  clearSelection: () => void
  onAddChildHeading: (nodeId: string) => string | null
  onAddSiblingHeading: (nodeId: string) => string | null
  onAddSiblingHeadingBefore: (nodeId: string) => string | null
  onDeleteHeading: (nodeId: string) => string | null
  selectHeading: (nodeId: string | null) => void
}

export const useGraphKeyboardActions = ({
  editable,
  edges,
  graphShellRef,
  nodes,
  selectedHeadingId,
  clearSelection,
  onAddChildHeading,
  onAddSiblingHeading,
  onAddSiblingHeadingBefore,
  onDeleteHeading,
  selectHeading,
}: UseGraphKeyboardActionsArgs) => {
  const shortcutOverrides = useAppStore((state) => state.shortcutOverrides)
  const focusSelectedHeadingTitle = useCallback(() => {
    if (!selectedHeadingId) return
    const nodeElement = Array.from(
      graphShellRef.current?.querySelectorAll<HTMLElement>('[data-graph-node-id]') ?? [],
    ).find((element) => element.dataset.graphNodeId === selectedHeadingId)
    const titleElement = nodeElement?.querySelector<HTMLElement>(
      '[data-markdown-block-role="title"]',
    )
    if (!titleElement) return
    titleElement.focus()
    selectElementText(titleElement)
  }, [graphShellRef, selectedHeadingId])

  const executeGraphHotkey = useCallback(
    (action: GraphHotkeyAction, event: KeyboardEvent) => {
      if (!editable || !selectedHeadingId) return
      if (event.defaultPrevented || isTextEditingTarget(event.target)) return

      if (action === 'add-sibling') {
        preventGraphHotkeyDefault(event)
        selectHeading(onAddSiblingHeading(selectedHeadingId))
        return
      }

      if (action === 'add-sibling-before') {
        preventGraphHotkeyDefault(event)
        selectHeading(onAddSiblingHeadingBefore(selectedHeadingId))
        return
      }

      if (action === 'add-child') {
        preventGraphHotkeyDefault(event)
        selectHeading(onAddChildHeading(selectedHeadingId))
        return
      }

      if (action === 'delete') {
        preventGraphHotkeyDefault(event)
        selectHeading(onDeleteHeading(selectedHeadingId))
        return
      }

      if (action === 'edit-title') {
        preventGraphHotkeyDefault(event)
        focusSelectedHeadingTitle()
        return
      }

      const nextSelection = getKeyboardNavigationTarget(action, nodes, edges, selectedHeadingId)
      if (nextSelection !== undefined) {
        preventGraphHotkeyDefault(event)
        selectHeading(nextSelection)
        return
      }

      if (action === 'clear-selection') {
        preventGraphHotkeyDefault(event)
        clearSelection()
      }
    },
    [
      clearSelection,
      editable,
      edges,
      focusSelectedHeadingTitle,
      nodes,
      onAddChildHeading,
      onAddSiblingHeading,
      onAddSiblingHeadingBefore,
      onDeleteHeading,
      selectHeading,
      selectedHeadingId,
    ],
  )

  const hotkeyDefinitions = useMemo<UseHotkeyDefinition[]>(() => {
    const bindings = resolveShortcutBindings(shortcutOverrides)
    return graphShortcutActions.flatMap(([shortcutAction, graphAction]) =>
      bindings[shortcutAction].map((hotkey) => ({
        hotkey: hotkey as RegisterableHotkey,
        callback: (event) => executeGraphHotkey(graphAction, event),
        options: {
          enabled: editable,
          meta: { name: shortcutAction },
        },
      })),
    )
  }, [editable, executeGraphHotkey, shortcutOverrides])

  useHotkeys(hotkeyDefinitions, {
    conflictBehavior: 'replace',
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
    target: graphShellRef,
  })

  const handleGraphMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isTextEditingTarget(event.target)) return
      graphShellRef.current?.focus()
    },
    [graphShellRef],
  )

  return { handleGraphMouseDown }
}

const getKeyboardNavigationTarget = (
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

const preventGraphHotkeyDefault = (event: KeyboardEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

const isTextEditingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

const selectElementText = (element: HTMLElement) => {
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  selection?.removeAllRanges()
  selection?.addRange(range)
}
