import { useCallback, useMemo, type MouseEvent, type RefObject } from 'react'
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import {
  createGraphHotkeyBindings,
  getInitialKeyboardNavigationTarget,
  getKeyboardNavigationTarget,
  isGraphCanvasEvent,
  preventGraphHotkeyDefault,
  type GraphHotkeyAction,
} from '@/pages/graphKeyboardActions'
import {
  adjustGraphZoom,
  fitGraphHeading,
  fitVisibleGraph as fitVisibleGraphViewport,
} from '@/pages/graphViewportActions'
import { useGraphTitleFocus } from '@/pages/useGraphTitleFocus'
import { useGraphCollapseState } from '@/pages/useGraphCollapseState'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type UseGraphKeyboardActionsArgs = {
  editable: boolean
  edges: Edge[]
  flowInstance: ReactFlowInstance<Node<GraphNodeData>, Edge> | null
  graphShellRef: RefObject<HTMLDivElement | null>
  nodes: Node<GraphNodeData>[]
  selectedHeadingId: string | null
  clearSelection: () => void
  onHotkeyFeedback?: (action: GraphHotkeyAction) => void
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
  onHotkeyFeedback,
  onAddChildHeading,
  onAddSiblingHeading,
  onAddSiblingHeadingBefore,
  onDeleteHeading,
  selectHeading,
}: UseGraphKeyboardActionsArgs) => {
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const { focusHeadingTitle, focusHeadingTitleSoon } = useGraphTitleFocus(graphShellRef)
  const { collapsedNodeIds, collapseNode, expandNode, visibleEdges, visibleNodes } =
    useGraphCollapseState(nodes, edges, {
      onSelectionChange: selectHeading,
      selectedNodeId: selectedHeadingId,
    })

  const focusSelectedHeadingTitle = useCallback(() => {
    focusHeadingTitle(selectedHeadingId)
  }, [focusHeadingTitle, selectedHeadingId])

  const fitHeading = useCallback(
    (headingId: string | null) => {
      fitGraphHeading(flowInstance, visibleNodes, headingId)
    },
    [flowInstance, visibleNodes],
  )

  const fitSelectedHeading = useCallback(() => {
    fitHeading(selectedHeadingId)
  }, [fitHeading, selectedHeadingId])

  const fitVisibleGraph = useCallback(() => {
    fitVisibleGraphViewport(flowInstance, visibleNodes.length)
  }, [flowInstance, visibleNodes.length])

  const adjustZoom = useCallback(
    (direction: 'in' | 'out') => {
      adjustGraphZoom(flowInstance, direction)
    },
    [flowInstance],
  )

  const collapseSelectedHeading = useCallback(
    (includeDescendants: boolean) => {
      if (selectedHeadingId) collapseNode(selectedHeadingId, includeDescendants)
    },
    [collapseNode, selectedHeadingId],
  )

  const expandSelectedHeading = useCallback(
    (includeDescendants: boolean) => {
      if (selectedHeadingId) expandNode(selectedHeadingId, includeDescendants)
    },
    [expandNode, selectedHeadingId],
  )

  const executeGraphHotkey = useCallback(
    (action: GraphHotkeyAction, event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        !isGraphCanvasEvent(event, graphShellRef.current)
      )
        return

      if (action === 'fit-view') {
        preventGraphHotkeyDefault(event)
        fitVisibleGraph()
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'zoom-in') {
        preventGraphHotkeyDefault(event)
        adjustZoom('in')
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'zoom-out') {
        preventGraphHotkeyDefault(event)
        adjustZoom('out')
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'clear-selection') {
        preventGraphHotkeyDefault(event)
        clearSelection()
        onHotkeyFeedback?.(action)
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
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'collapse') {
        preventGraphHotkeyDefault(event)
        collapseSelectedHeading(false)
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'collapse-subtree') {
        preventGraphHotkeyDefault(event)
        collapseSelectedHeading(true)
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'expand') {
        preventGraphHotkeyDefault(event)
        expandSelectedHeading(false)
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'expand-subtree') {
        preventGraphHotkeyDefault(event)
        expandSelectedHeading(true)
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'navigate-child' && collapsedNodeIds.has(selectedHeadingId)) {
        preventGraphHotkeyDefault(event)
        expandSelectedHeading(false)
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
        if (nextSelection) {
          selectHeading(nextSelection)
          fitHeading(nextSelection)
        }
        return
      }

      if (!editable) return

      if (action === 'add-sibling' || action === 'add-sibling-before' || action === 'add-child') {
        preventGraphHotkeyDefault(event)
        const addHeading =
          action === 'add-child'
            ? onAddChildHeading
            : action === 'add-sibling-before'
              ? onAddSiblingHeadingBefore
              : onAddSiblingHeading
        const nextHeadingId = addHeading(selectedHeadingId)
        if (!nextHeadingId) return
        if (action === 'add-child') expandSelectedHeading(false)
        selectHeading(nextHeadingId)
        focusHeadingTitleSoon(nextHeadingId)
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'delete') {
        preventGraphHotkeyDefault(event)
        selectHeading(onDeleteHeading(selectedHeadingId))
        onHotkeyFeedback?.(action)
        return
      }

      if (action === 'edit-title') {
        preventGraphHotkeyDefault(event)
        focusSelectedHeadingTitle()
        onHotkeyFeedback?.(action)
      }
    },
    [
      adjustZoom,
      collapseSelectedHeading,
      clearSelection,
      collapsedNodeIds,
      editable,
      fitHeading,
      expandSelectedHeading,
      fitSelectedHeading,
      fitVisibleGraph,
      focusHeadingTitleSoon,
      focusSelectedHeadingTitle,
      graphShellRef,
      onAddChildHeading,
      onAddSiblingHeading,
      onAddSiblingHeadingBefore,
      onDeleteHeading,
      onHotkeyFeedback,
      selectHeading,
      selectedHeadingId,
      visibleNodes,
      visibleEdges,
    ],
  )
  const hotkeyDefinitions = useMemo(
    () =>
      createGraphHotkeyBindings(shortcutOverrides).map(({ action, ...binding }) => ({
        ...binding,
        callback: (event: KeyboardEvent) => executeGraphHotkey(action, event),
      })),
    [executeGraphHotkey, shortcutOverrides],
  )

  useHotkeys(hotkeyDefinitions, {
    conflictBehavior: 'replace',
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
    target: graphShellRef,
  })

  const handleGraphMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || !isGraphCanvasEvent(event.nativeEvent, graphShellRef.current))
        return
      const graphShell = graphShellRef.current
      if (graphShell && document.activeElement !== graphShell) {
        graphShell.focus()
      }
    },
    [graphShellRef],
  )

  return { handleGraphMouseDown, visibleEdges, visibleNodes }
}
