import { useCallback, useMemo, type KeyboardEvent } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { isImeKeyboardEvent } from '@/logic/ime'
import { getWorkspaceMapNodeOpenPath } from '@/pages/workspace-map/workspaceMapNodePresentation'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'

type WorkspaceMapKeyboardOptions = {
  activePath: string | null
  activateNode: (node: Node<GraphNodeData>) => void
  exitFocusedView: () => boolean
  flow: ReactFlowInstance<Node<GraphNodeData>, Edge> | null
  focusNode: (node: Node<GraphNodeData>) => void
  mode: WorkspaceMapMode
  nodes: Node<GraphNodeData>[]
  onCloseEditor: () => void
  onModeChange: (mode: WorkspaceMapMode) => void
}

export const useWorkspaceMapKeyboard = ({
  activePath,
  activateNode,
  exitFocusedView,
  flow,
  focusNode,
  mode,
  nodes,
  onCloseEditor,
  onModeChange,
}: WorkspaceMapKeyboardOptions) => {
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!(event.target instanceof HTMLElement)) return
      if (event.defaultPrevented || isImeKeyboardEvent(event.nativeEvent)) return
      if (event.key === 'Escape' && activePath) {
        event.preventDefault()
        event.stopPropagation()
        onCloseEditor()
        return
      }
      if (event.key === 'Escape' && exitFocusedView()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.key === 'Escape' && mode === 'focus') {
        event.preventDefault()
        event.stopPropagation()
        onModeChange('overview')
        return
      }
      if (event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) {
        return
      }
      const nodeElement = event.target.closest<HTMLElement>('.react-flow__node')
      const node = nodesById.get(nodeElement?.dataset.id ?? '')
      if (event.key.toLowerCase() === 'f' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (!node) return
        event.preventDefault()
        event.stopPropagation()
        focusNode(node)
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        event.stopPropagation()
        void flow?.zoomIn({ duration: 0 })
        return
      }
      if (event.key === '-') {
        event.preventDefault()
        event.stopPropagation()
        void flow?.zoomOut({ duration: 0 })
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        event.stopPropagation()
        void flow?.fitView({ duration: 0, maxZoom: 1, minZoom: 0.35, padding: 0.22 })
        return
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (!nodeElement || event.target !== nodeElement) return
      if (!node || !getWorkspaceMapNodeOpenPath(node)) return
      event.preventDefault()
      event.stopPropagation()
      activateNode(node)
    },
    [
      activePath,
      activateNode,
      exitFocusedView,
      flow,
      focusNode,
      mode,
      nodesById,
      onCloseEditor,
      onModeChange,
    ],
  )
}
