import { useCallback, useMemo, type KeyboardEvent } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { isImeKeyboardEvent } from '@/logic/ime'
import { getWorkspaceMapNodeOpenPath } from '@/pages/workspace-map/workspaceMapNodePresentation'

type WorkspaceMapKeyboardOptions = {
  activePath: string | null
  activateNode: (node: Node<GraphNodeData>) => void
  flow: ReactFlowInstance<Node<GraphNodeData>, Edge> | null
  nodes: Node<GraphNodeData>[]
  onCloseEditor: () => void
}

export const useWorkspaceMapKeyboard = ({
  activePath,
  activateNode,
  flow,
  nodes,
  onCloseEditor,
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
      if (event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) {
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
      const nodeElement = event.target.closest<HTMLElement>('.react-flow__node')
      if (!nodeElement || event.target !== nodeElement) return
      const node = nodesById.get(nodeElement.dataset.id ?? '')
      if (!node || !getWorkspaceMapNodeOpenPath(node)) return
      event.preventDefault()
      event.stopPropagation()
      activateNode(node)
    },
    [activePath, activateNode, flow, nodesById, onCloseEditor],
  )
}
