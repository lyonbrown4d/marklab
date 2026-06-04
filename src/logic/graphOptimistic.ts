import type { GraphData } from '@/logic/graph'
import type { MarkdownBlock } from '@/logic/markdownBlocks'

type PatchGraphHeadingInsertedArgs = {
  insertLine: number
  level: number
  nodeId: string
  parentId: string
  targetId: string
  title: string
}

type PatchGraphHeadingDeletedArgs = {
  deleteEndLine: number
  deleteStartLine: number
  targetId: string
}

export const patchGraphHeadingTitle = (graph: GraphData, nodeId: string, title: string) => {
  let changed = false
  const nodes = graph.nodes.map((node) => {
    if (node.id !== nodeId || node.data.label === title) return node
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        label: title,
      },
    }
  })

  return changed ? { ...graph, nodes } : graph
}

export const patchGraphHeadingInserted = (
  graph: GraphData,
  { insertLine, level, nodeId, parentId, targetId, title }: PatchGraphHeadingInsertedArgs,
) => {
  const target = graph.nodes.find((node) => node.id === targetId)
  if (!target || insertLine < 1 || level < 1 || level > 6) return graph

  const nodes = graph.nodes
    .map((node) => ({
      ...node,
      selected: false,
      data: shiftGraphNodeDataLines(node.data, insertLine, 1),
    }))
    .concat({
      id: nodeId,
      type: 'heading',
      selected: true,
      data: {
        label: title,
        subtitle: `H${level}`,
        path: typeof target.data.path === 'string' ? target.data.path : undefined,
        line: insertLine,
        level,
        content: '',
        contentBlocks: [],
        contentStartLine: insertLine + 1,
        contentEndLine: insertLine + 1,
      },
      position: {
        x: target.position.x + (parentId === targetId ? 260 : 0),
        y: target.position.y + 120,
      },
    })

  return {
    ...graph,
    nodes,
    edges: [
      ...graph.edges,
      {
        id: `${parentId}->${nodeId}-${graph.edges.length}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
      },
    ],
  }
}

export const patchGraphHeadingDeleted = (
  graph: GraphData,
  { deleteEndLine, deleteStartLine, targetId }: PatchGraphHeadingDeletedArgs,
) => {
  if (deleteStartLine < 1 || deleteEndLine <= deleteStartLine) return graph
  const target = graph.nodes.find((node) => node.id === targetId)
  if (!target) return graph

  const deletedIds = new Set(
    graph.nodes
      .filter((node) => {
        if (node.type !== 'heading') return false
        const line = node.data.line
        return typeof line === 'number' && line >= deleteStartLine && line < deleteEndLine
      })
      .map((node) => node.id),
  )
  if (deletedIds.size === 0) return graph

  const lineDelta = deleteStartLine - deleteEndLine
  const parentId = graph.edges.find((edge) => edge.target === targetId)?.source
  const nodes = graph.nodes
    .filter((node) => !deletedIds.has(node.id))
    .map((node) => ({
      ...node,
      selected: parentId ? node.id === parentId : false,
      data: shiftGraphNodeDataLines(node.data, deleteEndLine, lineDelta),
    }))
  const edges = graph.edges.filter(
    (edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target),
  )

  return { ...graph, nodes, edges }
}

export const patchGraphHeadingContent = (
  graph: GraphData,
  nodeId: string,
  content: string,
  contentBlocks?: MarkdownBlock[],
) => {
  const target = graph.nodes.find((node) => node.id === nodeId)
  const previousStartLine = target?.data.contentStartLine
  const previousEndLine = target?.data.contentEndLine
  const nextEndLine =
    previousStartLine === undefined ? undefined : previousStartLine + countMarkdownLines(content)
  const lineDelta =
    previousEndLine === undefined || nextEndLine === undefined ? 0 : nextEndLine - previousEndLine
  let changed = false

  const nodes = graph.nodes.map((node) => {
    if (node.id === nodeId) {
      changed = true
      return {
        ...node,
        data: {
          ...node.data,
          content,
          contentBlocks,
          contentEndLine: nextEndLine,
        },
      }
    }

    if (!previousEndLine || lineDelta === 0) return node
    const line = shiftLineAfter(node.data.line, previousEndLine, lineDelta)
    const contentStartLine = shiftLineAfter(node.data.contentStartLine, previousEndLine, lineDelta)
    const contentEndLine = shiftLineAfter(node.data.contentEndLine, previousEndLine, lineDelta)
    if (
      line === node.data.line &&
      contentStartLine === node.data.contentStartLine &&
      contentEndLine === node.data.contentEndLine
    ) {
      return node
    }
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        line,
        contentStartLine,
        contentEndLine,
      },
    }
  })

  return changed ? { ...graph, nodes } : graph
}

const countMarkdownLines = (content: string) => {
  if (content.length === 0) return 0
  return content.split(/\r\n|\r|\n/).length
}

const shiftLineAfter = (line: number | undefined, afterLine: number, delta: number) => {
  if (line === undefined || line < afterLine) return line
  return Math.max(1, line + delta)
}

const shiftGraphNodeDataLines = (
  data: GraphData['nodes'][number]['data'],
  startLine: number,
  delta: number,
) => {
  const line = shiftLineOnOrAfter(data.line, startLine, delta)
  const contentStartLine = shiftLineOnOrAfter(data.contentStartLine, startLine, delta)
  const contentEndLine = shiftLineOnOrAfter(data.contentEndLine, startLine, delta)
  if (
    line === data.line &&
    contentStartLine === data.contentStartLine &&
    contentEndLine === data.contentEndLine
  ) {
    return data
  }

  return {
    ...data,
    line,
    contentStartLine,
    contentEndLine,
  }
}

const shiftLineOnOrAfter = (line: number | undefined, startLine: number, delta: number) => {
  if (line === undefined || line < startLine) return line
  return Math.max(1, line + delta)
}
