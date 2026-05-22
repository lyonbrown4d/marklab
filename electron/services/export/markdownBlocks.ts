import {
  isBlockStart,
  isBlockquoteLine,
  isClosingFence,
  isTableSeparator,
  isThematicBreak,
  listMarker,
  openingFence,
  splitTableRow,
  stripBlockquotePrefix,
} from '@electron/services/export/markdownBlockSyntax.js'
import { parseInlines } from '@electron/services/export/markdownInlines.js'
import type { MarkdownBlock, MarkdownInline } from '@electron/services/export/markdownTypes.js'

export const parseBlocks = (lines: string[]): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = []
  let index = 0
  let paragraph: string[] = []

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', children: parseInlines(text) })
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''

    const fence = openingFence(line)
    if (fence) {
      flushParagraph()
      const code: string[] = []
      index += 1
      while (index < lines.length) {
        const nextLine = lines[index] ?? ''
        if (isClosingFence(nextLine, fence.marker)) break
        code.push(nextLine)
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'codeBlock', text: code.join('\n'), language: fence.language })
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      index += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: heading[1]?.length ?? 1,
        children: parseInlines(heading[2] ?? ''),
      })
      index += 1
      continue
    }

    if (isThematicBreak(line)) {
      flushParagraph()
      blocks.push({ type: 'thematicBreak' })
      index += 1
      continue
    }

    if (isBlockquoteLine(line)) {
      flushParagraph()
      const quoteLines: string[] = []
      while (index < lines.length && isBlockquoteLine(lines[index] ?? '')) {
        quoteLines.push(stripBlockquotePrefix(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ type: 'blockquote', blocks: parseBlocks(quoteLines) })
      continue
    }

    const table = parseTable(lines, index)
    if (table) {
      flushParagraph()
      blocks.push(table.block)
      index = table.nextIndex
      continue
    }

    const list = parseList(lines, index)
    if (list) {
      flushParagraph()
      blocks.push(list.block)
      index = list.nextIndex
      continue
    }

    paragraph.push(line.trim())
    index += 1
  }

  flushParagraph()
  return blocks
}

const parseList = (
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null => {
  const first = listMarker(lines[startIndex] ?? '')
  if (!first) return null

  const items: MarkdownInline[][] = []
  let index = startIndex

  while (index < lines.length) {
    const marker = listMarker(lines[index] ?? '')
    if (!marker || marker.ordered !== first.ordered) break

    const parts = [marker.text]
    index += 1

    while (index < lines.length) {
      const continuation = lines[index] ?? ''
      if (!continuation.trim()) {
        index += 1
        break
      }
      if (listMarker(continuation) || isBlockStart(continuation)) break
      parts.push(continuation.trim())
      index += 1
    }

    items.push(parseInlines(parts.join(' ').trim()))
  }

  return { block: { type: 'list', ordered: first.ordered, items }, nextIndex: index }
}

const parseTable = (
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null => {
  const headerLine = lines[startIndex] ?? ''
  const separatorLine = lines[startIndex + 1] ?? ''
  if (!headerLine.includes('|') || !isTableSeparator(separatorLine)) return null

  const header = splitTableRow(headerLine)
  const separator = splitTableRow(separatorLine)
  if (header.length === 0 || separator.length < header.length) return null

  const rows: MarkdownInline[][][] = []
  let index = startIndex + 2
  while (index < lines.length) {
    const rowLine = lines[index] ?? ''
    if (!rowLine.trim() || !rowLine.includes('|')) break
    rows.push(splitTableRow(rowLine).map((cell) => parseInlines(cell.trim())))
    index += 1
  }

  return {
    block: {
      type: 'table',
      header: header.map((cell) => parseInlines(cell.trim())),
      rows,
    },
    nextIndex: index,
  }
}
