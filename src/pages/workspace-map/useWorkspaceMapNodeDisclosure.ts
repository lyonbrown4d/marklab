import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

type Options = {
  activePath: string | null
  nodes: Node<GraphNodeData>[]
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>
}

type NodeGeometry = Pick<Node<GraphNodeData>, 'height' | 'measured' | 'style' | 'width'>

const COLLAPSED_NODE_WIDTH = 220
const COLLAPSED_NODE_HEIGHT = 72

const isRichWorkspaceNode = (node: Node<GraphNodeData>) =>
  node.type === 'file' ||
  (node.type === 'preview' && Boolean(node.data.previewKind)) ||
  (node.type === 'external' && Boolean(node.data.webView))

const compactNode = (node: Node<GraphNodeData>): Node<GraphNodeData> => ({
  ...node,
  height: COLLAPSED_NODE_HEIGHT,
  measured: { height: COLLAPSED_NODE_HEIGHT, width: COLLAPSED_NODE_WIDTH },
  style: { ...node.style, height: COLLAPSED_NODE_HEIGHT, width: COLLAPSED_NODE_WIDTH },
  width: COLLAPSED_NODE_WIDTH,
})

export const useWorkspaceMapNodeDisclosure = ({ activePath, nodes, setNodes }: Options) => {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const expandedGeometryRef = useRef(new Map<string, NodeGeometry>())

  const setCollapsed = useCallback(
    (nodeId: string, collapsed: boolean) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId || !isRichWorkspaceNode(node)) return node
          if (collapsed) {
            expandedGeometryRef.current.set(nodeId, {
              height: node.height ?? node.measured?.height,
              measured: node.measured,
              style: node.style,
              width: node.width ?? node.measured?.width,
            })
            return compactNode(node)
          }
          const geometry = expandedGeometryRef.current.get(nodeId)
          if (!geometry) return node
          expandedGeometryRef.current.delete(nodeId)
          return { ...node, ...geometry }
        }),
      )
      setCollapsedNodeIds((current) => {
        if (current.has(nodeId) === collapsed) return current
        const next = new Set(current)
        if (collapsed) next.add(nodeId)
        else next.delete(nodeId)
        return next
      })
    },
    [setNodes],
  )

  const toggleNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeId)
      if (
        !node ||
        node.data.workspaceMapEditor ||
        node.data.path === activePath ||
        node.data.webView?.active
      )
        return
      setCollapsed(nodeId, !collapsedNodeIds.has(nodeId))
    },
    [activePath, collapsedNodeIds, nodes, setCollapsed],
  )

  useEffect(() => {
    const activeNode = nodes.find(
      (node) =>
        collapsedNodeIds.has(node.id) &&
        (node.data.path === activePath || node.data.webView?.active),
    )
    if (activeNode && collapsedNodeIds.has(activeNode.id)) setCollapsed(activeNode.id, false)
  }, [activePath, collapsedNodeIds, nodes, setCollapsed])

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => {
        if (!isRichWorkspaceNode(node)) return node
        const active =
          Boolean(node.data.workspaceMapEditor) ||
          node.data.path === activePath ||
          Boolean(node.data.webView?.active)
        return {
          ...node,
          data: {
            ...node.data,
            workspaceMapDisclosure: active
              ? undefined
              : { collapsed: collapsedNodeIds.has(node.id), toggle: toggleNode },
          },
        }
      }),
    [activePath, collapsedNodeIds, nodes, toggleNode],
  )

  return { nodes: renderedNodes }
}
