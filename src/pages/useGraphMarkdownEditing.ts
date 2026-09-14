import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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
  baseMarkdown: string
  markdown: string
  graph: GraphData
}

export const useGraphMarkdownEditing = ({
  graph,
  markdown,
  onChange,
}: UseGraphMarkdownEditingOptions) => {
  const [optimisticGraph, setOptimisticGraph] = useState<OptimisticGraphState | null>(null)
  const workingRef = useRef<OptimisticGraphState | null>(null)
  const editorState = resolveGraphEditSnapshot(optimisticGraph, graph, markdown)
  // Once acknowledged, returning to older text is an external edit, not a delayed prop.
  if (
    editorState === optimisticGraph &&
    markdown === editorState.markdown &&
    editorState.baseMarkdown !== markdown
  ) {
    setOptimisticGraph({ ...editorState, baseMarkdown: markdown })
  }
  useLayoutEffect(() => {
    workingRef.current = editorState
  }, [editorState])
  const readCurrent = useCallback(
    () => resolveGraphEditSnapshot(workingRef.current, graph, markdown),
    [graph, markdown],
  )
  const publish = useCallback(
    (current: OptimisticGraphState, nextMarkdown: string, nextGraph: GraphData) => {
      if (nextMarkdown === current.markdown) return
      const next = {
        baseGraph: graph,
        baseMarkdown: markdown,
        markdown: nextMarkdown,
        graph: nextGraph,
      }
      workingRef.current = next
      setOptimisticGraph(next)
      onChange(nextMarkdown)
    },
    [graph, markdown, onChange],
  )

  const updateHeadingTitle = useCallback(
    (nodeId: string, title: string) => {
      const current = readCurrent()
      const node = current.graph.nodes.find((item) => item.id === nodeId)
      const headingLine = node?.data.line
      const level = node?.data.level
      if (!headingLine || !level) return

      publish(
        current,
        replaceMarkdownHeadingTitle(current.markdown, headingLine, level, title),
        patchGraphHeadingTitle(current.graph, nodeId, title),
      )
    },
    [publish, readCurrent],
  )

  const updateHeadingContent = useCallback(
    (nodeId: string, content: string, contentBlocks?: MarkdownBlock[]) => {
      const current = readCurrent()
      const node = current.graph.nodes.find((item) => item.id === nodeId)
      const startLine = node?.data.contentStartLine
      const endLine = node?.data.contentEndLine
      if (!startLine || !endLine) return

      publish(
        current,
        replaceMarkdownLineRange(current.markdown, startLine, endLine, content),
        patchGraphHeadingContent(current.graph, nodeId, content, contentBlocks),
      )
    },
    [publish, readCurrent],
  )

  const addHeading = useCallback(
    (nodeId: string, placement: 'child' | 'sibling' | 'sibling-before') => {
      const current = readCurrent()
      const node = findEditableHeadingNode(current.graph.nodes.find((item) => item.id === nodeId))
      if (!node) return null

      const line = node.data.line
      const level = node.data.level
      if (!line || !level) return null

      if (placement === 'child' && level >= 6) return null

      const insertLine =
        placement === 'sibling-before'
          ? line
          : findHeadingSubtreeEndLine(current.graph.nodes, line, level, current.markdown)
      const nextLevel = placement === 'child' ? level + 1 : level
      const nextMarkdown = insertMarkdownHeadingAtLine(
        current.markdown,
        insertLine,
        nextLevel,
        NEW_HEADING_TITLE,
      )
      if (nextMarkdown === current.markdown) return null

      const parentId =
        placement === 'child'
          ? nodeId
          : (current.graph.edges.find((edge) => edge.target === nodeId)?.source ?? nodeId)
      const newNodeId = createOptimisticHeadingId(node, insertLine)

      publish(
        current,
        nextMarkdown,
        patchGraphHeadingInserted(current.graph, {
          insertLine,
          level: nextLevel,
          nodeId: newNodeId,
          parentId,
          targetId: nodeId,
          title: NEW_HEADING_TITLE,
        }),
      )
      return newNodeId
    },
    [publish, readCurrent],
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
      const current = readCurrent()
      const node = findEditableHeadingNode(current.graph.nodes.find((item) => item.id === nodeId))
      if (!node) return null

      const line = node.data.line
      const level = node.data.level
      if (!line || !level) return null

      const deleteEndLine = findHeadingSubtreeEndLine(
        current.graph.nodes,
        line,
        level,
        current.markdown,
      )
      const nextMarkdown = replaceMarkdownLineRange(current.markdown, line, deleteEndLine, '')
      if (nextMarkdown === current.markdown) return null
      const parentId = current.graph.edges.find((edge) => edge.target === nodeId)?.source ?? null

      publish(
        current,
        nextMarkdown,
        patchGraphHeadingDeleted(current.graph, {
          deleteEndLine,
          deleteStartLine: line,
          targetId: nodeId,
        }),
      )
      return parentId
    },
    [publish, readCurrent],
  )

  return {
    addChildHeading,
    addSiblingHeading,
    addSiblingHeadingBefore,
    deleteHeading,
    editorGraph: editorState.graph,
    updateHeadingContent,
    updateHeadingTitle,
  }
}

const graphDocumentKey = (graph: GraphData) => {
  const heading = graph.nodes.find((node) => node.type === 'heading')
  return heading?.data.path ?? heading?.id.slice(0, heading.id.lastIndexOf(':'))
}

const resolveGraphEditSnapshot = (
  pending: OptimisticGraphState | null,
  graph: GraphData,
  markdown: string,
): OptimisticGraphState => {
  const documentKey = graphDocumentKey(graph)
  const sameDocument =
    pending &&
    (pending.baseGraph === graph ||
      (documentKey !== undefined && documentKey === graphDocumentKey(pending.baseGraph)))
  if (
    pending &&
    sameDocument &&
    (markdown === pending.baseMarkdown || markdown === pending.markdown)
  ) {
    return pending
  }
  return { baseGraph: graph, baseMarkdown: markdown, markdown, graph }
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
