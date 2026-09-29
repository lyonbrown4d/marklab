import type { GraphData } from '@/logic/graph'
import type { MindmapDropPlacement } from '@/pages/graph/mindmapModel'

type HeadingRange = { start: number; end: number; level: number; headingLines: Set<number> }

export const reorderMindmapHeading = (
  markdown: string,
  graph: GraphData,
  nodeId: string,
  direction: 'up' | 'down',
) => {
  const siblings = siblingIds(graph, nodeId)
  const index = siblings.indexOf(nodeId)
  const targetId = siblings[index + (direction === 'up' ? -1 : 1)]
  if (!targetId) return markdown
  return moveMindmapHeading(
    markdown,
    graph,
    nodeId,
    targetId,
    direction === 'up' ? 'before' : 'after',
  )
}

export const moveMindmapHeading = (
  markdown: string,
  graph: GraphData,
  nodeId: string,
  targetId: string,
  placement: MindmapDropPlacement,
) => {
  if (nodeId === targetId || isDescendant(graph, nodeId, targetId)) return markdown
  const source = headingRange(graph, nodeId, markdown)
  const target = headingRange(graph, targetId, markdown)
  if (!source || !target) return markdown
  const nextLevel = placement === 'child' ? target.level + 1 : target.level
  const levelDelta = nextLevel - source.level
  if (!canShiftLevels(graph, source, levelDelta)) return markdown

  const document = splitDocument(markdown)
  const moved = document.lines.slice(source.start, source.end)
  source.headingLines.forEach((line) => {
    const localIndex = line - 1 - source.start
    moved[localIndex] = shiftHeadingLevel(moved[localIndex] ?? '', levelDelta)
  })
  const remaining = [...document.lines.slice(0, source.start), ...document.lines.slice(source.end)]
  const originalInsert = placement === 'before' ? target.start : target.end
  const insertAt =
    originalInsert > source.start ? originalInsert - (source.end - source.start) : originalInsert
  const lines = [...remaining.slice(0, insertAt), ...moved, ...remaining.slice(insertAt)]
  return joinDocument(lines, document.eol)
}

export const insertMindmapParent = (markdown: string, graph: GraphData, nodeId: string) => {
  const source = headingRange(graph, nodeId, markdown)
  if (!source || !canShiftLevels(graph, source, 1)) return markdown
  const document = splitDocument(markdown)
  const subtree = document.lines.slice(source.start, source.end)
  source.headingLines.forEach((line) => {
    const localIndex = line - 1 - source.start
    subtree[localIndex] = shiftHeadingLevel(subtree[localIndex] ?? '', 1)
  })
  const parent = `${'#'.repeat(source.level)} New Topic`
  const lines = [
    ...document.lines.slice(0, source.start),
    parent,
    ...subtree,
    ...document.lines.slice(source.end),
  ]
  return joinDocument(lines, document.eol)
}

const headingRange = (graph: GraphData, nodeId: string, markdown: string): HeadingRange | null => {
  const node = graph.nodes.find((item) => item.id === nodeId && item.type === 'heading')
  const line = node?.data.line
  const level = node?.data.level
  if (!line || !level) return null
  const headings = graph.nodes
    .filter((item) => item.type === 'heading' && typeof item.data.line === 'number')
    .sort((a, b) => Number(a.data.line) - Number(b.data.line))
  const next = headings.find(
    (item) => Number(item.data.line) > line && Number(item.data.level) <= level,
  )
  const documentLines = splitDocument(markdown).lines
  const documentEnd = documentLines.at(-1) === '' ? documentLines.length - 1 : documentLines.length
  const end = next ? Number(next.data.line) - 1 : documentEnd
  return {
    start: line - 1,
    end,
    level,
    headingLines: new Set(
      headings
        .filter((item) => Number(item.data.line) >= line && Number(item.data.line) <= end)
        .map((item) => Number(item.data.line)),
    ),
  }
}

const siblingIds = (graph: GraphData, nodeId: string) => {
  const parentId = graph.edges.find((edge) => edge.target === nodeId)?.source
  if (!parentId) return []
  const ids = new Set(
    graph.edges.filter((edge) => edge.source === parentId).map((edge) => edge.target),
  )
  return graph.nodes
    .filter((node) => ids.has(node.id))
    .sort((a, b) => Number(a.data.line) - Number(b.data.line))
    .map((node) => node.id)
}

const isDescendant = (graph: GraphData, ancestorId: string, possibleDescendantId: string) => {
  let current: string | undefined = possibleDescendantId
  while (current) {
    current = graph.edges.find((edge) => edge.target === current)?.source
    if (current === ancestorId) return true
  }
  return false
}

const canShiftLevels = (graph: GraphData, range: HeadingRange, delta: number) =>
  graph.nodes
    .filter((node) => range.headingLines.has(Number(node.data.line)))
    .every((node) => {
      const level = Number(node.data.level) + delta
      return level >= 1 && level <= 6
    })

const shiftHeadingLevel = (line: string, delta: number) =>
  line.replace(
    /^( {0,3})(#{1,6})(\s+)/,
    (_, indent: string, hashes: string, space: string) =>
      `${indent}${'#'.repeat(hashes.length + delta)}${space}`,
  )

const splitDocument = (markdown: string) => ({
  eol: markdown.match(/\r\n|\r|\n/)?.[0] ?? '\n',
  lines: markdown.split(/\r\n|\r|\n/),
})
const joinDocument = (lines: string[], eol: string) => lines.join(eol)
