import { useCallback, useMemo, useState, type MouseEvent, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import {
  useHotkeys,
  type RegisterableHotkey,
  type UseHotkeyDefinition,
} from '@tanstack/react-hotkeys'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { resolveShortcutBindings } from '@/logic/shortcuts'
import {
  buildContainsChildrenMap,
  getDescendants,
  getHiddenNodeIds,
  getVisibleGraphElements,
} from '@/logic/graphVisibility'
import {
  getInitialKeyboardNavigationTarget,
  getKeyboardNavigationTarget,
  graphShortcutActions,
  isTextEditingTarget,
  preventGraphHotkeyDefault,
  type GraphHotkeyAction,
} from '@/pages/graphKeyboardActions'
import { useGraphTitleFocus } from '@/pages/useGraphTitleFocus'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const ZOOM_STEP_IN = 1.16
const ZOOM_STEP_OUT = 1 / ZOOM_STEP_IN
const MIN_ZOOM = 0.15
const MAX_ZOOM = 2.2

type UseGraphKeyboardActionsArgs = {
  editable: boolean
  edges: Edge[]
  flowInstance: ReactFlowInstance<Node<GraphNodeData>, Edge> | null
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
  flowInstance,
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
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const { focusHeadingTitle, focusHeadingTitleSoon } = useGraphTitleFocus(graphShellRef)

  const containsChildrenByNode = useMemo(() => buildContainsChildrenMap(edges), [edges])

  const hiddenNodeIds = useMemo(
    () => getHiddenNodeIds(nodes, collapsedNodeIds, containsChildrenByNode),
    [collapsedNodeIds, containsChildrenByNode, nodes],
  )

  const { visibleEdges, visibleNodes } = useMemo(
    () => getVisibleGraphElements(nodes, edges, hiddenNodeIds),
    [edges, hiddenNodeIds, nodes],
  )

  const focusSelectedHeadingTitle = useCallback(() => {
    focusHeadingTitle(selectedHeadingId)
  }, [focusHeadingTitle, selectedHeadingId])

  const fitHeading = useCallback(
    (headingId: string | null) => {
      if (!flowInstance || !headingId) return
      const selectedNode = visibleNodes.find((node) => node.id === headingId)
      if (!selectedNode) return
      flowInstance.fitView({
        nodes: [selectedNode],
        padding: 0.32,
        duration: 120,
      })
    },
    [flowInstance, visibleNodes],
  )

  const fitSelectedHeading = useCallback(() => {
    fitHeading(selectedHeadingId)
  }, [fitHeading, selectedHeadingId])

  const fitVisibleGraph = useCallback(() => {
    if (!flowInstance || visibleNodes.length === 0) return
    flowInstance.fitView({ padding: 0.22, duration: 160 })
  }, [flowInstance, visibleNodes.length])

  const adjustZoom = useCallback(
    (direction: 'in' | 'out') => {
      if (!flowInstance) return
      const viewport = flowInstance.getViewport()
      const nextZoom =
        direction === 'in'
          ? Math.min(MAX_ZOOM, viewport.zoom * ZOOM_STEP_IN)
          : Math.max(MIN_ZOOM, viewport.zoom * ZOOM_STEP_OUT)
      flowInstance.setViewport({ ...viewport, zoom: nextZoom }, { duration: 120 })
    },
    [flowInstance],
  )

  const collapseSelectedHeading = useCallback(
    (includeDescendants: boolean) => {
      if (!selectedHeadingId || !containsChildrenByNode.has(selectedHeadingId)) return
      const descendants = includeDescendants
        ? getDescendants([selectedHeadingId], containsChildrenByNode)
        : new Set<string>()

      setCollapsedNodeIds((current) => {
        const next = new Set(current)
        next.add(selectedHeadingId)
        descendants.forEach((nodeId) => next.add(nodeId))
        return next
      })
    },
    [containsChildrenByNode, selectedHeadingId],
  )

  const expandSelectedHeading = useCallback(
    (includeDescendants: boolean) => {
      if (!selectedHeadingId) return
      const descendants = includeDescendants
        ? getDescendants([selectedHeadingId], containsChildrenByNode)
        : new Set<string>()

      setCollapsedNodeIds((current) => {
        if (!current.has(selectedHeadingId) && descendants.size === 0) return current
        const next = new Set(current)
        next.delete(selectedHeadingId)
        descendants.forEach((nodeId) => next.delete(nodeId))
        return next
      })
    },
    [containsChildrenByNode, selectedHeadingId],
  )

  const executeGraphHotkey = useCallback(
    (action: GraphHotkeyAction, event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextEditingTarget(event.target)) return

      if (action === 'fit-view') {
        preventGraphHotkeyDefault(event)
        fitVisibleGraph()
        return
      }

      if (action === 'zoom-in') {
        preventGraphHotkeyDefault(event)
        adjustZoom('in')
        return
      }

      if (action === 'zoom-out') {
        preventGraphHotkeyDefault(event)
        adjustZoom('out')
        return
      }

      if (action === 'clear-selection') {
        preventGraphHotkeyDefault(event)
        clearSelection()
        return
      }

      if (!selectedHeadingId) {
        const nextSelection = getInitialKeyboardNavigationTarget(action, visibleNodes)
        if (!nextSelection) return
        preventGraphHotkeyDefault(event)
        selectHeading(nextSelection)
        fitHeading(nextSelection)
        return
      }

      if (action === 'focus-selection') {
        preventGraphHotkeyDefault(event)
        fitSelectedHeading()
        return
      }

      if (action === 'collapse') {
        preventGraphHotkeyDefault(event)
        collapseSelectedHeading(false)
        return
      }

      if (action === 'collapse-subtree') {
        preventGraphHotkeyDefault(event)
        collapseSelectedHeading(true)
        return
      }

      if (action === 'expand') {
        preventGraphHotkeyDefault(event)
        expandSelectedHeading(false)
        return
      }

      if (action === 'expand-subtree') {
        preventGraphHotkeyDefault(event)
        expandSelectedHeading(true)
        return
      }

      const nextSelection = getKeyboardNavigationTarget(
        action,
        visibleNodes,
        visibleEdges,
        selectedHeadingId,
      )
      if (nextSelection !== undefined) {
        preventGraphHotkeyDefault(event)
        selectHeading(nextSelection)
        fitHeading(nextSelection)
      }

      if (!editable) return

      if (action === 'add-sibling') {
        preventGraphHotkeyDefault(event)
        const nextHeadingId = onAddSiblingHeading(selectedHeadingId)
        selectHeading(nextHeadingId)
        focusHeadingTitleSoon(nextHeadingId)
        return
      }

      if (action === 'add-sibling-before') {
        preventGraphHotkeyDefault(event)
        const nextHeadingId = onAddSiblingHeadingBefore(selectedHeadingId)
        selectHeading(nextHeadingId)
        focusHeadingTitleSoon(nextHeadingId)
        return
      }

      if (action === 'add-child') {
        preventGraphHotkeyDefault(event)
        const nextHeadingId = onAddChildHeading(selectedHeadingId)
        selectHeading(nextHeadingId)
        focusHeadingTitleSoon(nextHeadingId)
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
      }
    },
    [
      adjustZoom,
      collapseSelectedHeading,
      clearSelection,
      editable,
      fitHeading,
      expandSelectedHeading,
      fitSelectedHeading,
      fitVisibleGraph,
      focusHeadingTitleSoon,
      focusSelectedHeadingTitle,
      onAddChildHeading,
      onAddSiblingHeading,
      onAddSiblingHeadingBefore,
      onDeleteHeading,
      selectHeading,
      selectedHeadingId,
      visibleNodes,
      visibleEdges,
    ],
  )
  const executeGraphHotkeyRef = useLatest(executeGraphHotkey)

  const hotkeyDefinitions = useMemo<UseHotkeyDefinition[]>(() => {
    const bindings = resolveShortcutBindings(shortcutOverrides)
    return graphShortcutActions.flatMap(([shortcutAction, graphAction]) =>
      bindings[shortcutAction].map((hotkey) => ({
        hotkey: hotkey as RegisterableHotkey,
        callback: (event) => executeGraphHotkeyRef.current(graphAction, event),
        options: {
          enabled: true,
          meta: { name: shortcutAction },
        },
      })),
    )
  }, [executeGraphHotkeyRef, shortcutOverrides])

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

  return { handleGraphMouseDown, visibleEdges, visibleNodes }
}
