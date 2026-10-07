import type { MarkdownNode, MarkdownRoot } from '@electron/services/workspace/markdown/ast'

const SUMMARY_BLOCKS = 3
const SUMMARY_CHARACTERS = 420

export const workspaceFileSummary = (content: string, tree: MarkdownRoot): string => {
  const frontmatterEndOffset = leadingFrontmatterEndOffset(content)
  const excerpts: string[] = []

  for (const node of tree.children) {
    const excerpt = normalizedSummaryText(
      markdownNodeSummaryText(node, content, frontmatterEndOffset),
    )
    if (!excerpt) continue
    excerpts.push(excerpt)
    if (excerpts.length === SUMMARY_BLOCKS) break
  }

  const summaryBlocks = excerpts.length
    ? excerpts
    : workspaceHeadingFallback(tree, content, frontmatterEndOffset)
  const summary = summaryBlocks.join('\n\n')
  if (summary.length <= SUMMARY_CHARACTERS) return summary
  return `${summary.slice(0, SUMMARY_CHARACTERS - 3).trimEnd()}...`
}

const workspaceHeadingFallback = (
  tree: MarkdownRoot,
  content: string,
  contentStartOffset: number,
): string[] => {
  const headings = tree.children.filter((node) => {
    if (node.type !== 'heading') return false
    const endOffset = node.position?.end.offset
    return typeof endOffset !== 'number' || endOffset > contentStartOffset
  })
  const candidates = headings[0]?.depth === 1 ? headings.slice(1) : headings
  const excerpts = new Map<string, string>()

  for (const heading of candidates) {
    const excerpt = normalizedSummaryText(
      markdownNodeSummaryText(heading, content, contentStartOffset, true),
    )
    if (excerpt) excerpts.set(excerpt.toLocaleLowerCase(), excerpt)
    if (excerpts.size === SUMMARY_BLOCKS) break
  }

  return [...excerpts.values()]
}

const leadingFrontmatterEndOffset = (content: string): number => {
  const firstLine = markdownLineAtOffset(content, 0)
  const delimiter = firstLine.text.trim()
  if (delimiter !== '---' && delimiter !== '+++') return 0

  let offset = firstLine.nextOffset
  while (offset < content.length) {
    const line = markdownLineAtOffset(content, offset)
    if (line.text.trim() === delimiter) return line.nextOffset
    offset = line.nextOffset
  }

  return 0
}

const markdownLineAtOffset = (
  content: string,
  startOffset: number,
): { text: string; nextOffset: number } => {
  let endOffset = startOffset
  while (endOffset < content.length && content[endOffset] !== '\r' && content[endOffset] !== '\n') {
    endOffset += 1
  }

  let nextOffset = endOffset
  if (content[nextOffset] === '\r') nextOffset += 1
  if (content[nextOffset] === '\n') nextOffset += 1
  return { text: content.slice(startOffset, endOffset), nextOffset }
}

const skippedNodeTypes = new Set([
  'code',
  'definition',
  'heading',
  'html',
  'inlineCode',
  'thematicBreak',
])
const lineNodeTypes = new Set(['blockquote', 'list', 'listItem', 'table', 'tableCell', 'tableRow'])

const markdownNodeSummaryText = (
  node: MarkdownNode,
  content: string,
  contentStartOffset: number,
  includeHeading = false,
): string => {
  const nodeEndOffset = node.position?.end.offset
  if (typeof nodeEndOffset === 'number' && nodeEndOffset <= contentStartOffset) return ''
  if (skippedNodeTypes.has(node.type) && !(includeHeading && node.type === 'heading')) return ''
  if (node.type === 'break') return '\n'
  if (node.type === 'text') {
    const startOffset = node.position?.start.offset
    const endOffset = node.position?.end.offset
    if (
      typeof startOffset === 'number' &&
      typeof endOffset === 'number' &&
      startOffset < contentStartOffset
    ) {
      return content.slice(contentStartOffset, endOffset)
    }
    return node.value ?? ''
  }
  if (node.type === 'image') return node.alt ?? ''
  const children =
    node.children
      ?.map((child) => markdownNodeSummaryText(child, content, contentStartOffset))
      .filter(Boolean) ?? []
  return children.join(lineNodeTypes.has(node.type) ? '\n' : '')
}

const normalizedSummaryText = (value: string): string =>
  value
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
