import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'

import { charLength, sliceChars } from './text.js'

export type MarkdownPoint = {
  line: number
  column: number
  offset?: number
}

export type MarkdownPosition = {
  start: MarkdownPoint
  end: MarkdownPoint
}

export type MarkdownNode = {
  type: string
  position?: MarkdownPosition
  children?: MarkdownNode[]
  value?: string
  depth?: number
  url?: string
  title?: string | null
  alt?: string | null
  identifier?: string
  label?: string | null
  referenceType?: string
  lang?: string | null
  meta?: string | null
  ordered?: boolean | null
  align?: Array<string | null>
}

export type MarkdownRoot = MarkdownNode & {
  type: 'root'
  children: MarkdownNode[]
}

export type MarkdownParent = MarkdownNode & {
  children: MarkdownNode[]
}

const markdownProcessor = unified().use(remarkParse).use(remarkGfm)

export const parseMarkdownAst = (content: string): MarkdownRoot => {
  return markdownProcessor.parse(content) as MarkdownRoot
}

export const hasChildren = (node: MarkdownNode): node is MarkdownParent => {
  return Array.isArray(node.children)
}

export const lineAt = (lines: string[], line: number | null | undefined): string => {
  if (!line || line < 1) return ''
  return lines[line - 1] ?? ''
}

export const rawNodeText = (content: string, node: MarkdownNode): string => {
  const position = node.position
  if (!position) return ''

  if (
    typeof position.start.offset === 'number' &&
    typeof position.end.offset === 'number' &&
    position.end.offset >= position.start.offset
  ) {
    return content.slice(position.start.offset, position.end.offset)
  }

  const lines = content.split(/\r?\n/)
  const startLine = Math.max(position.start.line, 1)
  const endLine = Math.max(position.end.line, startLine)
  const selected = lines.slice(startLine - 1, endLine)
  if (selected.length === 0) return ''

  selected[0] = sliceChars(selected[0] ?? '', Math.max(position.start.column - 1, 0), Infinity)
  const last = selected.length - 1
  selected[last] = sliceChars(selected[last] ?? '', 0, Math.max(position.end.column - 1, 0))
  return selected.join('\n')
}

export const textOffsetPoint = (
  start: MarkdownPoint,
  value: string,
  offset: number,
): { line: number; column: number } => {
  const prefix = value.slice(0, offset)
  const parts = prefix.split('\n')
  if (parts.length === 1) {
    return { line: start.line, column: start.column + charLength(prefix) }
  }

  const lastLine = parts[parts.length - 1] ?? ''
  return {
    line: start.line + parts.length - 1,
    column: charLength(lastLine) + 1,
  }
}

export const isHeadingNode = (node: MarkdownNode): node is MarkdownNode & { depth: number } => {
  return node.type === 'heading' && typeof node.depth === 'number'
}

export const isLinkNode = (node: MarkdownNode): node is MarkdownNode & { url: string } => {
  return node.type === 'link' && typeof node.url === 'string'
}

export const isImageNode = (node: MarkdownNode): node is MarkdownNode & { url: string } => {
  return node.type === 'image' && typeof node.url === 'string'
}

export const isDefinitionNode = (node: MarkdownNode): node is MarkdownNode & { url: string } => {
  return node.type === 'definition' && typeof node.url === 'string'
}

export const isLinkReferenceNode = (
  node: MarkdownNode,
): node is MarkdownNode & { identifier: string } => {
  return node.type === 'linkReference' && typeof node.identifier === 'string'
}

export const isImageReferenceNode = (
  node: MarkdownNode,
): node is MarkdownNode & { identifier: string } => {
  return node.type === 'imageReference' && typeof node.identifier === 'string'
}

export const isTextNode = (node: MarkdownNode): node is MarkdownNode & { value: string } => {
  return node.type === 'text' && typeof node.value === 'string'
}
