import { useCallback, useEffect, type MouseEvent, type RefObject } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { getSpatialHeadingId, type SpatialDirection } from '@/logic/graphKeyboardNavigation'
import { adjustGraphZoom } from '@/pages/graphViewportActions'
import { useGraphTitleFocus } from '@/pages/useGraphTitleFocus'
import {
  resolveMindmapKeyboardCommand,
  type MindmapKeyboardCommand,
} from '@/pages/graph/mindmapKeyboard'
import type { MindmapModel } from '@/pages/graph/mindmapModel'

type Options = {
  collapsedIds: Set<string>
  editable: boolean
  flowInstance: ReactFlowInstance<Node<GraphNodeData>, Edge> | null
  model: MindmapModel
  nodes: Node<GraphNodeData>[]
  selectedId: string | null
  shellRef: RefObject<HTMLDivElement | null>
  addChild: (id: string) => string | null
  addSibling: (id: string) => string | null
  deleteHeading: (id: string) => string | null
  insertParent?: (id: string) => boolean
  reorder?: (id: string, direction: 'up' | 'down') => boolean
  redo?: () => boolean
  select: (id: string | null) => void
  setCollapsedIds: (update: (current: Set<string>) => Set<string>) => void
  undo?: () => boolean
}

export const useMindmapInteractions = (options: Options) => {
  const {
    addChild: addChildHeading,
    addSibling: addSiblingHeading,
    deleteHeading,
    editable,
    flowInstance,
    insertParent,
    model,
    nodes,
    redo,
    reorder,
    select,
    selectedId,
    setCollapsedIds,
    shellRef,
    undo,
  } = options
  const { focusHeadingTitle, focusHeadingTitleSoon } = useGraphTitleFocus(shellRef)

  const centerNode = useCallback(
    (id: string) => {
      const node = nodes.find((item) => item.id === id)
      if (!node || !flowInstance) return
      const zoom = flowInstance.getViewport().zoom
      flowInstance.setCenter(
        node.position.x + (node.measured?.width ?? node.width ?? 180) / 2,
        node.position.y + (node.measured?.height ?? node.height ?? 56) / 2,
        { zoom, duration: reducedMotion() ? 0 : 120 },
      )
    },
    [flowInstance, nodes],
  )

  const selectAndCenter = useCallback(
    (id: string | null) => {
      if (!id) return
      select(id)
      centerNode(id)
    },
    [centerNode, select],
  )

  const toggleFold = useCallback(
    (id: string) => {
      if (!model.childrenById.get(id)?.length) return
      setCollapsedIds((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [model.childrenById, setCollapsedIds],
  )

  const execute = useCallback(
    (command: MindmapKeyboardCommand) => {
      if (command === 'undo') return undo?.() ?? false
      if (command === 'redo') return redo?.() ?? false
      if (command === 'zoom-in' || command === 'zoom-out') {
        const selected = nodes.find((node) => node.id === selectedId)
        adjustGraphZoom(flowInstance, command === 'zoom-in' ? 'in' : 'out', selected)
        return Boolean(flowInstance)
      }
      if (command === 'center-root') {
        const root = model.roots[0]
        if (!root) return false
        selectAndCenter(root)
        return true
      }
      if (command.startsWith('navigate-')) {
        const direction = command.slice('navigate-'.length) as SpatialDirection
        const next = selectedId ? getSpatialHeadingId(nodes, selectedId, direction) : model.roots[0]
        if (!next) return false
        selectAndCenter(next)
        return true
      }
      if (!selectedId) return false
      if (command === 'toggle-fold') {
        toggleFold(selectedId)
        return true
      }
      if (command === 'edit') return focusHeadingTitle(selectedId)
      if (!editable) return false
      if (command === 'add-child' || command === 'add-sibling') {
        const id =
          command === 'add-child' ? addChildHeading(selectedId) : addSiblingHeading(selectedId)
        if (!id) return false
        select(id)
        focusHeadingTitleSoon(id)
        return true
      }
      if (command === 'add-parent') return insertParent?.(selectedId) ?? false
      if (command === 'delete') {
        select(deleteHeading(selectedId))
        return true
      }
      if (command === 'reorder-up' || command === 'reorder-down') {
        return reorder?.(selectedId, command === 'reorder-up' ? 'up' : 'down') ?? false
      }
      return false
    },
    [
      addChildHeading,
      addSiblingHeading,
      deleteHeading,
      editable,
      flowInstance,
      focusHeadingTitle,
      focusHeadingTitleSoon,
      insertParent,
      model.roots,
      nodes,
      redo,
      reorder,
      select,
      selectAndCenter,
      selectedId,
      toggleFold,
      undo,
    ],
  )

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const onKeyDown = (event: KeyboardEvent) => {
      const command = resolveMindmapKeyboardCommand(event, Boolean(selectedId))
      if (!command || !execute(command)) return
      event.preventDefault()
      event.stopPropagation()
    }
    shell.addEventListener('keydown', onKeyDown)
    return () => shell.removeEventListener('keydown', onKeyDown)
  }, [execute, selectedId, shellRef])

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button, input, textarea, [contenteditable="true"]'))
      return
    shellRef.current?.focus()
  }
  const addChild = useCallback(() => execute('add-child'), [execute])
  const addSibling = useCallback(() => execute('add-sibling'), [execute])

  return {
    addChild,
    addSibling,
    centerNode,
    edit: focusHeadingTitle,
    handleMouseDown,
    toggleFold,
  }
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
