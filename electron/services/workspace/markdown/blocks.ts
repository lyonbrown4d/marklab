import type { FsMarkdownBlock } from '@electron/services/workspace/types.js'
import {
  parseMarkdownAst,
  rawNodeText,
  type MarkdownNode,
} from '@electron/services/workspace/markdown/ast.js'
import { trimLineBreaks } from '@electron/services/workspace/markdown/text.js'

export const parseMarkdownBlocks = (baseId: string, markdown: string): FsMarkdownBlock[] => {
  const blocks: FsMarkdownBlock[] = []
  const tree = parseMarkdownAst(markdown)

  const pushBlock = (block: Omit<FsMarkdownBlock, 'id'>) => {
    blocks.push({ id: `${baseId}:block:${blocks.length}`, ...block })
  }

  for (const node of tree.children) {
    const block = blockFromNode(markdown, node)
    if (block) pushBlock(block)
  }

  return blocks
}

const blockFromNode = (
  markdown: string,
  node: MarkdownNode,
): Omit<FsMarkdownBlock, 'id'> | null => {
  switch (node.type) {
    case 'code':
      return codeBlock(markdown, node)
    case 'thematicBreak':
      return { kind: 'divider' }
    case 'blockquote':
      return blockquoteBlock(markdown, node)
    case 'list':
      return listBlock(markdown, node)
    case 'table':
      return tableBlock(markdown, node)
    case 'definition':
      return paragraphBlock(rawNodeText(markdown, node))
    default:
      return paragraphBlock(rawNodeText(markdown, node))
  }
}

const paragraphBlock = (raw: string): Omit<FsMarkdownBlock, 'id'> | null => {
  const text = trimLineBreaks(raw).trim()
  return text ? { kind: 'paragraph', text } : null
}

const codeBlock = (markdown: string, node: MarkdownNode): Omit<FsMarkdownBlock, 'id'> | null => {
  const text = trimLineBreaks(node.value ?? '')
  if (!text) return null

  return {
    kind: 'code',
    text,
    language: codeFenceLanguage(rawNodeText(markdown, node)) ?? node.lang ?? null,
  }
}

const blockquoteBlock = (
  markdown: string,
  node: MarkdownNode,
): Omit<FsMarkdownBlock, 'id'> | null => {
  const raw = rawNodeText(markdown, node)
  const quoteLines: string[] = []
  let level = 1

  for (const line of raw.split(/\r?\n/)) {
    const quote = parseBlockquoteLine(line)
    if (quote) {
      level = Math.max(level, quote.level)
      quoteLines.push(quote.text)
    } else {
      quoteLines.push('')
    }
  }

  const text = trimLineBreaks(quoteLines.join('\n')).trim()
  return text ? { kind: 'blockquote', text, level } : null
}

const listBlock = (markdown: string, node: MarkdownNode): Omit<FsMarkdownBlock, 'id'> | null => {
  const ordered = Boolean(node.ordered)
  const items =
    node.children
      ?.map((child) => listItemText(rawNodeText(markdown, child)))
      .filter((item) => item.length > 0) ?? []

  return items.length > 0 ? { kind: 'list', ordered, items } : null
}

const tableBlock = (markdown: string, node: MarkdownNode): Omit<FsMarkdownBlock, 'id'> | null => {
  const raw = rawNodeText(markdown, node)
  const serialized = serializeTable(raw.split(/\r?\n/))
  return serialized ? { kind: 'table', text: serialized } : null
}

const listItemText = (raw: string): string => {
  const lines = raw.split(/\r?\n/)
  if (lines.length === 0) return ''

  lines[0] = (lines[0] ?? '').replace(/^([ \t]{0,3})(?:[-*+]|\d{1,9}[.)])[ \t]+/, '')
  for (let index = 1; index < lines.length; index += 1) {
    lines[index] = (lines[index] ?? '').replace(/^[ \t]{2,4}/, '')
  }

  return trimLineBreaks(lines.join('\n')).trim()
}

const parseBlockquoteLine = (line: string): { level: number; text: string } | null => {
  const match = /^[ \t]{0,3}((?:>[ \t]?)+)(.*)$/.exec(line)
  if (!match) return null

  return {
    level: (match[1]?.match(/>/g) ?? []).length,
    text: match[2] ?? '',
  }
}

const codeFenceLanguage = (raw: string): string | null => {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? ''
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(firstLine)
  const language = match?.[2]?.trim() ?? ''
  return language || null
}

const serializeTable = (lines: string[]): string => {
  const rows = lines.map(splitTableRow).filter((row) => row.length > 0)
  if (rows.length < 2) return lines.map((line) => line.trim()).join('\n')

  const columnCount = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row, index) => {
    const padded = [...row]
    while (padded.length < columnCount) padded.push('')
    if (index === 1) return Array.from({ length: columnCount }, () => '---')
    return padded.map((cell) => cell.trim())
  })

  return normalized
    .map((row) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`)
    .join('\n')
}

const splitTableRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (char === '\\' && trimmed[index + 1] === '|') {
      cell += '|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(cell.trim())
    } else {
      cell += char
      continue
    }
    cell = ''
  }

  cells.push(cell.trim())
  return cells
}
