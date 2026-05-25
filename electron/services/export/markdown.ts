import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { normalizeHtmlBreaks } from '@electron/services/export/markdownText.js'
import type { MarkdownBlock, MarkdownInline } from '@electron/services/export/markdownTypes.js'

export type { MarkdownBlock, MarkdownInline } from '@electron/services/export/markdownTypes.js'

type MdastNode = {
  type: string
  value?: string
  lang?: string
  depth?: number
  ordered?: boolean
  url?: string
  title?: string | null
  alt?: string | null
  children?: MdastNode[]
}

export const parseMarkdown = (markdown: string): MarkdownBlock[] => {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(normalizeMarkdownForExport(markdown))
  return blockChildren(tree as MdastNode)
}

export const normalizeMarkdownForExport = (markdown: string): string => {
  return normalizeHtmlBreaks(markdown)
}

export const plainTextFromInlines = (inlines: MarkdownInline[]): string => {
  return inlines
    .map((inline) => {
      if (inline.type === 'text' || inline.type === 'code') return inline.text
      if (inline.type === 'image') return inline.alt || inline.url
      return plainTextFromInlines(inline.children)
    })
    .join('')
}

const blockChildren = (node: MdastNode): MarkdownBlock[] => {
  return (node.children ?? []).flatMap((child) => blockFromNode(child))
}

const blockFromNode = (node: MdastNode): MarkdownBlock[] => {
  if (node.type === 'heading') {
    return [
      {
        type: 'heading',
        level: clampHeadingDepth(node.depth),
        children: inlineChildren(node),
      },
    ]
  }

  if (node.type === 'paragraph') return paragraphBlocks(inlineChildren(node))
  if (node.type === 'blockquote') return [{ type: 'blockquote', blocks: blockChildren(node) }]
  if (node.type === 'code')
    return [{ type: 'codeBlock', text: node.value ?? '', language: node.lang }]
  if (node.type === 'list') return [listBlock(node)]
  if (node.type === 'thematicBreak') return [{ type: 'thematicBreak' }]
  if (node.type === 'table') return [tableBlock(node)]
  if (node.type === 'html') return htmlBlocks(node.value)

  const inlines = inlineFromNode(node)
  return inlines.length > 0 ? [{ type: 'paragraph', children: inlines }] : []
}

const paragraphBlocks = (children: MarkdownInline[]): MarkdownBlock[] => {
  return children.length > 0 ? [{ type: 'paragraph', children }] : []
}

const listBlock = (node: MdastNode): MarkdownBlock => {
  return {
    type: 'list',
    ordered: Boolean(node.ordered),
    items: (node.children ?? [])
      .filter((child) => child.type === 'listItem')
      .map((child) => listItemInlines(child)),
  }
}

const listItemInlines = (node: MdastNode): MarkdownInline[] => {
  return (node.children ?? []).flatMap((child, index) => {
    const inlines = child.type === 'paragraph' ? inlineChildren(child) : inlineFromNode(child)
    if (index === 0 || inlines.length === 0) return inlines
    return [{ type: 'text', text: ' ' } satisfies MarkdownInline, ...inlines]
  })
}

const tableBlock = (node: MdastNode): MarkdownBlock => {
  const rows = (node.children ?? []).filter((child) => child.type === 'tableRow')
  const [header, ...bodyRows] = rows.map((row) =>
    (row.children ?? [])
      .filter((cell) => cell.type === 'tableCell')
      .map((cell) => inlineChildren(cell)),
  )

  return {
    type: 'table',
    header: header ?? [],
    rows: bodyRows,
  }
}

const inlineChildren = (node: MdastNode): MarkdownInline[] => {
  return (node.children ?? []).flatMap((child) => inlineFromNode(child))
}

const inlineFromNode = (node: MdastNode): MarkdownInline[] => {
  if (node.type === 'text') return textInline(node.value ?? '')
  if (node.type === 'inlineCode') return [{ type: 'code', text: node.value ?? '' }]
  if (node.type === 'strong') return [{ type: 'strong', children: inlineChildren(node) }]
  if (node.type === 'emphasis') return [{ type: 'emphasis', children: inlineChildren(node) }]
  if (node.type === 'delete') return inlineChildren(node)
  if (node.type === 'break') return textInline('\n')
  if (node.type === 'link') return [linkInline(node)]
  if (node.type === 'image') return [imageInline(node)]
  if (node.type === 'html') return htmlInline(node.value)
  if (node.children) return inlineChildren(node)
  return textInline(node.value ?? '')
}

const textInline = (text: string): MarkdownInline[] => {
  return text ? [{ type: 'text', text }] : []
}

const linkInline = (node: MdastNode): MarkdownInline => {
  return {
    type: 'link',
    url: node.url ?? '',
    title: node.title ?? undefined,
    children: inlineChildren(node),
  }
}

const imageInline = (node: MdastNode): MarkdownInline => {
  return {
    type: 'image',
    url: node.url ?? '',
    title: node.title ?? undefined,
    alt: node.alt ?? '',
  }
}

const htmlBlocks = (value: string | undefined): MarkdownBlock[] => {
  const inline = htmlInline(value)
  return inline.length > 0 ? [{ type: 'paragraph', children: inline }] : []
}

const htmlInline = (value: string | undefined): MarkdownInline[] => {
  return /^<\/?br\s*\/?>$/i.test(value ?? '') ? textInline('\n') : []
}

const clampHeadingDepth = (depth: number | undefined): number => {
  if (!depth || depth < 1) return 1
  return Math.min(depth, 6)
}
