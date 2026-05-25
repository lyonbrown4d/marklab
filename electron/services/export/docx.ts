import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { FileChild, IParagraphOptions, ParagraphChild } from 'docx'
import {
  parseMarkdown,
  plainTextFromInlines,
  type MarkdownBlock,
  type MarkdownInline,
} from '@electron/services/export/markdown.js'

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel]

type InlineStyle = {
  bold?: boolean
  italics?: boolean
  code?: boolean
  color?: string
  underline?: boolean
}

const orderedListReference = 'marklab-ordered-list'
const monospaceFont = 'Consolas'
const defaultTextColor = '111827'
const linkColor = '2563EB'

export const renderDocx = async (markdown: string): Promise<Buffer> => {
  const blocks = parseMarkdown(markdown)
  const children = blocksToDocxChildren(blocks)
  const document = new Document({
    creator: 'Marklab',
    title: firstDocumentTitle(blocks),
    numbering: {
      config: [
        {
          reference: orderedListReference,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        children: children.length > 0 ? children : [new Paragraph('')],
      },
    ],
  })

  return Packer.toBuffer(document)
}

const blocksToDocxChildren = (blocks: MarkdownBlock[]): FileChild[] => {
  return blocks.flatMap((block) => blockToDocxChildren(block))
}

const blockToDocxChildren = (block: MarkdownBlock): FileChild[] => {
  if (block.type === 'heading') return [headingParagraph(block)]
  if (block.type === 'paragraph') return [paragraphFromInlines(block.children)]
  if (block.type === 'blockquote') return blockquoteChildren(block.blocks)
  if (block.type === 'codeBlock') return codeBlockChildren(block)
  if (block.type === 'list') return listChildren(block)
  if (block.type === 'thematicBreak') return [new Paragraph({ thematicBreak: true })]
  if (block.type === 'table') return [tableFromBlock(block)]
  return []
}

const headingParagraph = (block: Extract<MarkdownBlock, { type: 'heading' }>): Paragraph => {
  return new Paragraph({
    heading: headingLevel(block.level),
    children: inlineChildren(block.children),
    spacing: { before: 240, after: 120 },
  })
}

const paragraphFromInlines = (
  inlines: MarkdownInline[],
  style: InlineStyle = {},
  options: Partial<IParagraphOptions> = {},
): Paragraph => {
  return new Paragraph({
    ...options,
    children: inlineChildren(inlines, style),
    spacing: { after: 120, ...('spacing' in options ? options.spacing : {}) },
  })
}

const blockquoteChildren = (blocks: MarkdownBlock[]): FileChild[] => {
  const children = blocks.flatMap((block) => blockquoteBlockChildren(block))
  return children.length > 0 ? children : [blockquoteParagraph([])]
}

const blockquoteBlockChildren = (block: MarkdownBlock): FileChild[] => {
  if (block.type === 'heading') return [blockquoteParagraph(block.children)]
  if (block.type === 'paragraph') return [blockquoteParagraph(block.children)]
  if (block.type === 'blockquote') return blockquoteChildren(block.blocks)
  if (block.type === 'codeBlock') return block.text.split(/\r?\n/).map((line) => codeQuote(line))
  if (block.type === 'list') return block.items.map((item) => blockquoteParagraph(item))
  if (block.type === 'table') return tableQuoteChildren(block)
  if (block.type === 'thematicBreak') return [new Paragraph({ thematicBreak: true })]
  return []
}

const blockquoteParagraph = (children: MarkdownInline[]): Paragraph => {
  return paragraphFromInlines(children, { italics: true }, blockquoteOptions())
}

const codeQuote = (line: string): Paragraph => {
  return new Paragraph({
    ...blockquoteOptions(),
    children: textRuns(line || ' ', { code: true }),
  })
}

const tableQuoteChildren = (block: Extract<MarkdownBlock, { type: 'table' }>): FileChild[] => {
  const rows = [block.header, ...block.rows]
  return rows.map((row) => blockquoteParagraph([{ type: 'text', text: tableRowText(row) }]))
}

const codeBlockChildren = (block: Extract<MarkdownBlock, { type: 'codeBlock' }>): FileChild[] => {
  const lines = block.text.split(/\r?\n/)
  const content = lines.length > 0 ? lines : ['']
  return content.map(
    (line) =>
      new Paragraph({
        children: textRuns(line || ' ', { code: true }),
        spacing: { before: 40, after: 40 },
      }),
  )
}

const listChildren = (block: Extract<MarkdownBlock, { type: 'list' }>): FileChild[] => {
  return block.items.map((item) =>
    paragraphFromInlines(item, {}, block.ordered ? orderedListOptions() : bulletListOptions()),
  )
}

const tableFromBlock = (block: Extract<MarkdownBlock, { type: 'table' }>): Table => {
  const rows = [block.header, ...block.rows].filter((row) => row.length > 0)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, rowIndex) => tableRow(row, rowIndex === 0)),
  })
}

const tableRow = (cells: MarkdownInline[][], isHeader: boolean): TableRow => {
  return new TableRow({
    children: cells.map(
      (cell) =>
        new TableCell({
          children: [
            paragraphFromInlines(cell, isHeader ? { bold: true } : {}, {
              spacing: { after: 0 },
            }),
          ],
        }),
    ),
  })
}

const inlineChildren = (inlines: MarkdownInline[], style: InlineStyle = {}): ParagraphChild[] => {
  const children = inlines.flatMap((inline) => inlineToChildren(inline, style))
  return children.length > 0 ? children : [new TextRun('')]
}

const inlineToChildren = (inline: MarkdownInline, style: InlineStyle): ParagraphChild[] => {
  if (inline.type === 'text') return textRuns(inline.text, style)
  if (inline.type === 'code') return textRuns(inline.text, { ...style, code: true })
  if (inline.type === 'strong') return inlineChildren(inline.children, { ...style, bold: true })
  if (inline.type === 'emphasis') {
    return inlineChildren(inline.children, { ...style, italics: true })
  }
  if (inline.type === 'image')
    return textRuns(inline.alt || inline.url, { ...style, italics: true })
  if (inline.type === 'link') return linkChildren(inline, style)
  return []
}

const linkChildren = (
  inline: Extract<MarkdownInline, { type: 'link' }>,
  style: InlineStyle,
): ParagraphChild[] => {
  const children = inlineChildren(inline.children, {
    ...style,
    color: linkColor,
    underline: true,
  })
  if (!isExternalLink(inline.url)) return children
  return [
    new ExternalHyperlink({
      link: inline.url,
      children,
    }),
  ]
}

const textRuns = (text: string, style: InlineStyle): TextRun[] => {
  const parts = text.split('\n')
  return parts.flatMap((part, index) => {
    const runs: TextRun[] = []
    if (index > 0) runs.push(new TextRun({ break: 1 }))
    if (part) runs.push(textRun(part, style))
    return runs
  })
}

const textRun = (text: string, style: InlineStyle): TextRun => {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    underline: style.underline ? {} : undefined,
    color: style.color ?? defaultTextColor,
    font: style.code ? monospaceFont : undefined,
  })
}

const orderedListOptions = (): Partial<IParagraphOptions> => {
  return {
    numbering: {
      reference: orderedListReference,
      level: 0,
    },
  }
}

const bulletListOptions = (): Partial<IParagraphOptions> => {
  return {
    bullet: { level: 0 },
  }
}

const headingLevel = (level: number): HeadingLevelValue => {
  if (level <= 1) return HeadingLevel.HEADING_1
  if (level === 2) return HeadingLevel.HEADING_2
  if (level === 3) return HeadingLevel.HEADING_3
  if (level === 4) return HeadingLevel.HEADING_4
  if (level === 5) return HeadingLevel.HEADING_5
  return HeadingLevel.HEADING_6
}

const firstDocumentTitle = (blocks: MarkdownBlock[]): string => {
  const heading = blocks.find((block) => block.type === 'heading')
  return heading?.type === 'heading' ? plainTextFromInlines(heading.children) : 'Marklab Export'
}

const isExternalLink = (url: string): boolean => {
  return /^https?:\/\//i.test(url) || /^mailto:/i.test(url)
}

const blockquoteOptions = (): Partial<IParagraphOptions> => {
  return {
    border: {
      left: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 8, space: 12 },
    },
    indent: { left: 360 },
    spacing: { after: 120 },
  }
}

const tableRowText = (row: MarkdownInline[][]): string => {
  return row.map((cell) => plainTextFromInlines(cell)).join(' | ')
}
