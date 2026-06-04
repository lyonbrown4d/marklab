import { useCallback, useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import {
  patchGraphHeadingContent,
  patchGraphHeadingDeleted,
  patchGraphHeadingInserted,
  patchGraphHeadingTitle,
} from '@/logic/graphOptimistic'
import {
  insertMarkdownHeadingAtLine,
  replaceMarkdownHeadingTitle,
  replaceMarkdownLineRange,
} from '@/logic/markdownDocumentEdits'
import type { MarkdownBlock } from '@/logic/markdownBlocks'

const NEW_HEADING_TITLE = 'New Topic'

type UseGraphMarkdownEditingOptions = {
  graph: GraphData
  markdown: string
  onChange: (value: string) => void
}

type OptimisticGraphState = {
  baseGraph: GraphData
  graph: GraphData
}

export const useGraphMarkdownEditing = ({
  graph,
  markdown,
  onChange,
}: UseGraphMarkdownEditingOptions) => {
  const [optimisticGraph, setOptimisticGraph] = useState<OptimisticGraphState | null>(null)
  const editorGraph = optimisticGraph?.baseGraph === graph ? optimisticGraph.graph : graph
  const nodesById = useMemo(
    () => new Map(editorGraph.nodes.map((node) => [node.id, node])),
    [editorGraph.nodes],
  )

  const updateHeadingTitle = useCallback(
    (nodeId: string, title: string) => {
      const node = nodesById.get(nodeId)
      const headingLine = node?.data.line
      const level = node?.data.level
      if (!headingLine || !level) return

      onChange(replaceMarkdownHeadingTitle(markdown, headingLine, level, title))
      setOptimisticGraph((current) => {
        const currentGraph = current?.baseGraph === graph ? current.graph : graph
        return {
          baseGraph: graph,
          graph: patchGraphHeadingTitle(currentGraph, nodeId, title),
        }
      })
    },
    [graph, markdown, nodesById, onChange],
  )

  const updateHeadingContent = useCallback(
    (nodeId: string, content: string, contentBlocks?: MarkdownBlock[]) => {
      const node = nodesById.get(nodeId)
      const startLine = node?.data.contentStartLine
      const endLine = node?.data.contentEndLine
      if (!startLine || !endLine) return

      onChange(replaceMarkdownLineRange(markdown, startLine, endLine, content))
      setOptimisticGraph((current) => {
        const currentGraph = current?.baseGraph === graph ? current.graph : graph
        return {
          baseGraph: graph,
          graph: patchGraphHeadingContent(currentGraph, nodeId, content, contentBlocks),
        }
      })
    },
    [graph, markdown, nodesById, onChange],
  )

  const addHeading = useCallback(
    (nodeId: string, placement: 'child' | 'sibling' | 'sibling-before') => {
      const node = findEditableHeadingNode(nodesById.get(nodeId))
      if (!node) return null

      const line = node.data.line
      const level = node.data.level
      if (!line || !level) return null

      const insertLine =
        placement === 'sibling-before'
          ? line
          : findHeadingSubtreeEndLine(editorGraph.nodes, line, level, markdown)
      const nextLevel = placement === 'child' ? Math.min(6, level + 1) : level
      const nextMarkdown = insertMarkdownHeadingAtLine(
        markdown,
        insertLine,
        nextLevel,
        NEW_HEADING_TITLE,
      )
      if (nextMarkdown === markdown) return null

      const parentId =
        placement === 'child'
          ? nodeId
          : (editorGraph.edges.find((edge) => edge.target === nodeId)?.source ?? nodeId)
      const newNodeId = createOptimisticHeadingId(node, insertLine)

      onChange(nextMarkdown)
      setOptimisticGraph((current) => {
        const currentGraph = current?.baseGraph === graph ? current.graph : graph
        return {
          baseGraph: graph,
          graph: patchGraphHeadingInserted(currentGraph, {
            insertLine,
            level: nextLevel,
            nodeId: newNodeId,
            parentId,
            targetId: nodeId,
            title: NEW_HEADING_TITLE,
          }),
        }
      })
      return newNodeId
    },
    [editorGraph.edges, editorGraph.nodes, graph, markdown, nodesById, onChange],
  )

  const addSiblingHeading = useCallback(
    (nodeId: string) => {
      return addHeading(nodeId, 'sibling')
    },
    [addHeading],
  )

  const addSiblingHeadingBefore = useCallback(
    (nodeId: string) => {
      return addHeading(nodeId, 'sibling-before')
    },
    [addHeading],
  )

  const addChildHeading = useCallback(
    (nodeId: string) => {
      return addHeading(nodeId, 'child')
    },
    [addHeading],
  )

  const deleteHeading = useCallback(
    (nodeId: string) => {
      const node = findEditableHeadingNode(nodesById.get(nodeId))
      if (!node) return null

      const line = node.data.line
      const level = node.data.level
      if (!line || !level) return null

      const deleteEndLine = findHeadingSubtreeEndLine(editorGraph.nodes, line, level, markdown)
      const nextMarkdown = replaceMarkdownLineRange(markdown, line, deleteEndLine, '')
      if (nextMarkdown === markdown) return null
      const parentId = editorGraph.edges.find((edge) => edge.target === nodeId)?.source ?? null

      onChange(nextMarkdown)
      setOptimisticGraph((current) => {
        const currentGraph = current?.baseGraph === graph ? current.graph : graph
        return {
          baseGraph: graph,
          graph: patchGraphHeadingDeleted(currentGraph, {
            deleteEndLine,
            deleteStartLine: line,
            targetId: nodeId,
          }),
        }
      })
      return parentId
    },
    [editorGraph.edges, editorGraph.nodes, graph, markdown, nodesById, onChange],
  )

  return {
    addChildHeading,
    addSiblingHeading,
    addSiblingHeadingBefore,
    deleteHeading,
    editorGraph,
    updateHeadingContent,
    updateHeadingTitle,
  }
}

const findEditableHeadingNode = (node: Node<GraphNodeData> | undefined) => {
  if (!node || node.type !== 'heading') return null
  if (typeof node.data.line !== 'number' || typeof node.data.level !== 'number') return null
  return node
}

const findHeadingSubtreeEndLine = (
  nodes: GraphData['nodes'],
  line: number,
  level: number,
  markdown: string,
) => {
  const nextPeerOrAncestor = nodes
    .filter((node) => {
      if (node.type !== 'heading') return false
      const nodeLine = node.data.line
      const nodeLevel = node.data.level
      return (
        typeof nodeLine === 'number' &&
        typeof nodeLevel === 'number' &&
        nodeLine > line &&
        nodeLevel <= level
      )
    })
    .sort((a, b) => Number(a.data.line) - Number(b.data.line))[0]

  return Number(nextPeerOrAncestor?.data.line) || countMarkdownLines(markdown) + 1
}

const countMarkdownLines = (markdown: string) => {
  if (markdown.length === 0) return 1
  return markdown.split(/\r\n|\r|\n/).length
}

const createOptimisticHeadingId = (node: Node<GraphNodeData>, insertLine: number) => {
  const path = typeof node.data.path === 'string' ? node.data.path : 'document'
  return `heading:${path}:new-topic-${insertLine}-${Date.now().toString(36)}`
}
