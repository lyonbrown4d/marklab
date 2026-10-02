import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export type VirtualizedMarkdownSegment = {
  endOffset: number
  estimatedHeight: number
  id: string
  leading: string
  markdown: string
  startOffset: number
}

export type VirtualizedMarkdownDocument = {
  segments: readonly VirtualizedMarkdownSegment[]
  toMarkdown: () => string
  trailing: string
}

const SEMANTIC_SPLIT_MIN_CHARS = 4_000
const SEMANTIC_SPLIT_MIN_LINES = 120
const HARD_SPLIT_MAX_CHARS = 16_000
const HARD_SPLIT_MAX_LINES = 480
const ESTIMATED_LINE_HEIGHT = 32
const MIN_ESTIMATED_HEIGHT = 160

const markdownParser = unified().use(remarkParse).use(remarkGfm)

type PositionedNode = {
  position: {
    end: { line: number; offset: number }
    start: { line: number; offset: number }
  }
  type: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isPosition = (value: unknown): value is PositionedNode['position'] => {
  if (!isRecord(value) || !isRecord(value.start) || !isRecord(value.end)) return false
  return (
    typeof value.start.offset === 'number' &&
    typeof value.start.line === 'number' &&
    typeof value.end.offset === 'number' &&
    typeof value.end.line === 'number'
  )
}

const isPositionedNode = (node: unknown): node is PositionedNode =>
  isRecord(node) && typeof node.type === 'string' && isPosition(node.position)

const rootChildren = (root: unknown): unknown[] =>
  isRecord(root) && Array.isArray(root.children) ? root.children : []

const splitOversizedParagraph = (markdown: string, node: PositionedNode): PositionedNode[] => {
  if (
    node.type !== 'paragraph' ||
    (node.position.end.offset - node.position.start.offset <= HARD_SPLIT_MAX_CHARS &&
      lineSpan(node) <= HARD_SPLIT_MAX_LINES)
  )
    return [node]

  const fragments: PositionedNode[] = []
  const endOffset = node.position.end.offset
  let startOffset = node.position.start.offset
  let startLine = node.position.start.line
  while (startOffset < endOffset) {
    let cursor = startOffset
    let lines = 1
    let lastLineBreak = -1
    while (
      cursor < endOffset &&
      cursor - startOffset < HARD_SPLIT_MAX_CHARS &&
      lines < HARD_SPLIT_MAX_LINES
    ) {
      if (markdown.charCodeAt(cursor) === 10) {
        lastLineBreak = cursor
        lines += 1
      }
      cursor += 1
    }
    const canUseLineBreak = lastLineBreak >= startOffset
    const fragmentEnd =
      cursor < endOffset && canUseLineBreak ? lastLineBreak + 1 : Math.max(cursor, startOffset + 1)
    const consumed = markdown.slice(startOffset, fragmentEnd)
    const consumedLines = consumed.split('\n').length - 1
    fragments.push({
      position: {
        end: { line: startLine + consumedLines, offset: fragmentEnd },
        start: { line: startLine, offset: startOffset },
      },
      type: 'paragraph-fragment',
    })
    startLine += consumedLines
    startOffset = fragmentEnd
  }
  return fragments
}

const lineSpan = (node: PositionedNode) => node.position.end.line - node.position.start.line + 1

const shouldSplitBefore = (
  node: PositionedNode,
  segmentStart: PositionedNode,
  previousNode: PositionedNode,
) => {
  const currentChars = previousNode.position.end.offset - segmentStart.position.start.offset
  const currentLines = previousNode.position.end.line - segmentStart.position.start.line + 1
  const projectedChars = node.position.end.offset - segmentStart.position.start.offset
  const projectedLines = node.position.end.line - segmentStart.position.start.line + 1
  const semanticBoundary =
    node.type === 'heading' &&
    (currentChars >= SEMANTIC_SPLIT_MIN_CHARS || currentLines >= SEMANTIC_SPLIT_MIN_LINES)
  return (
    semanticBoundary ||
    projectedChars > HARD_SPLIT_MAX_CHARS ||
    projectedLines > HARD_SPLIT_MAX_LINES
  )
}

const estimateSegmentHeight = (nodes: readonly PositionedNode[]) => {
  const lines = nodes.reduce((total, node) => total + lineSpan(node), 0)
  return Math.max(MIN_ESTIMATED_HEIGHT, lines * ESTIMATED_LINE_HEIGHT)
}

const assembleDocument = (
  segments: readonly VirtualizedMarkdownSegment[],
  trailing: string,
): VirtualizedMarkdownDocument => ({
  segments,
  toMarkdown: () =>
    `${segments.map((segment) => segment.leading + segment.markdown).join('')}${trailing}`,
  trailing,
})

export const createVirtualizedMarkdownDocument = (
  markdown: string,
): VirtualizedMarkdownDocument => {
  const root = markdownParser.parse(markdown)
  const nodes = rootChildren(root)
    .filter(isPositionedNode)
    .flatMap((node) => splitOversizedParagraph(markdown, node))
  if (nodes.length === 0) {
    return assembleDocument(
      [
        {
          endOffset: markdown.length,
          estimatedHeight: MIN_ESTIMATED_HEIGHT,
          id: 'segment-0-0',
          leading: '',
          markdown,
          startOffset: 0,
        },
      ],
      '',
    )
  }

  const groups: PositionedNode[][] = []
  let current: PositionedNode[] = []
  for (const node of nodes) {
    const first = current[0]
    const previous = current.at(-1)
    if (first && previous && shouldSplitBefore(node, first, previous)) {
      groups.push(current)
      current = []
    }
    current.push(node)
  }
  if (current.length > 0) groups.push(current)

  let previousEnd = 0
  const segments = groups.map((group, index) => {
    const first = group[0]
    const last = group.at(-1) ?? first
    const startOffset = first.position.start.offset
    const endOffset = last.position.end.offset
    const segment = {
      endOffset,
      estimatedHeight: estimateSegmentHeight(group),
      id: `segment-${index}-${startOffset}`,
      leading: markdown.slice(previousEnd, startOffset),
      markdown: markdown.slice(startOffset, endOffset),
      startOffset,
    }
    previousEnd = endOffset
    return segment
  })

  return assembleDocument(segments, markdown.slice(previousEnd))
}

export const updateVirtualizedMarkdownSegment = (
  document: VirtualizedMarkdownDocument,
  segmentId: string,
  markdown: string,
): VirtualizedMarkdownDocument => {
  let changed = false
  const segments = document.segments.map((segment) => {
    if (segment.id !== segmentId || segment.markdown === markdown) return segment
    changed = true
    return { ...segment, markdown }
  })
  return changed ? assembleDocument(segments, document.trailing) : document
}
