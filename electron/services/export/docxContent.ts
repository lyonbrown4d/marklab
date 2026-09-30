import { BorderStyle, HeadingLevel, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx'
import type { FileChild, IParagraphOptions } from 'docx'
import {
  plainTextFromInlines,
  type MarkdownBlock,
  type MarkdownInline,
} from '@electron/services/export/markdown.js'
import type { DocxImageMap } from '@electron/services/export/docxImages.js'
import {
  inlineChildren,
  paragraphFromInlines,
  textRuns,
} from '@electron/services/export/docxInlines.js'

type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel]
const orderedListReference = 'marklab-ordered-list'

export const blocksToDocxChildren = (blocks: MarkdownBlock[], images: DocxImageMap): FileChild[] =>
  blocks.flatMap((block) => blockToDocxChildren(block, images))

const blockToDocxChildren = (block: MarkdownBlock, images: DocxImageMap): FileChild[] => {
  if (block.type === 'heading') return [headingParagraph(block, images)]
  if (block.type === 'paragraph') return [paragraphFromInlines(block.children, {}, {}, images)]
  if (block.type === 'blockquote') return blockquoteChildren(block.blocks, images)
  if (block.type === 'codeBlock') return codeBlockChildren(block)
  if (block.type === 'list') return listChildren(block, images)
  if (block.type === 'thematicBreak') return [new Paragraph({ thematicBreak: true })]
  if (block.type === 'table') return [tableFromBlock(block, images)]
  return []
}

const headingParagraph = (
  block: Extract<MarkdownBlock, { type: 'heading' }>,
  images: DocxImageMap,
): Paragraph =>
  new Paragraph({
    heading: headingLevel(block.level),
    children: inlineChildren(block.children, {}, images),
    spacing: { before: 240, after: 120 },
  })

const blockquoteChildren = (blocks: MarkdownBlock[], images: DocxImageMap): FileChild[] => {
  const children = blocks.flatMap((block) => blockquoteBlockChildren(block, images))
  return children.length > 0 ? children : [blockquoteParagraph([], images)]
}

const blockquoteBlockChildren = (block: MarkdownBlock, images: DocxImageMap): FileChild[] => {
  if (block.type === 'heading' || block.type === 'paragraph')
    return [blockquoteParagraph(block.children, images)]
  if (block.type === 'blockquote') return blockquoteChildren(block.blocks, images)
  if (block.type === 'codeBlock') return block.text.split(/\r?\n/).map((line) => codeQuote(line))
  if (block.type === 'list') return block.items.map((item) => blockquoteParagraph(item, images))
  if (block.type === 'table') return tableQuoteChildren(block, images)
  if (block.type === 'thematicBreak') return [new Paragraph({ thematicBreak: true })]
  return []
}

const blockquoteParagraph = (children: MarkdownInline[], images: DocxImageMap): Paragraph =>
  paragraphFromInlines(children, { italics: true }, blockquoteOptions(), images)

const codeQuote = (line: string): Paragraph =>
  new Paragraph({ ...blockquoteOptions(), children: textRuns(line || ' ', { code: true }) })

const tableQuoteChildren = (
  block: Extract<MarkdownBlock, { type: 'table' }>,
  images: DocxImageMap,
): FileChild[] =>
  [block.header, ...block.rows].map((row) =>
    blockquoteParagraph([{ type: 'text', text: tableRowText(row) }], images),
  )

const codeBlockChildren = (block: Extract<MarkdownBlock, { type: 'codeBlock' }>): FileChild[] =>
  block.text.split(/\r?\n/).map(
    (line) =>
      new Paragraph({
        children: textRuns(line || ' ', { code: true }),
        spacing: { before: 40, after: 40 },
      }),
  )

const listChildren = (
  block: Extract<MarkdownBlock, { type: 'list' }>,
  images: DocxImageMap,
): FileChild[] =>
  block.items.map((item) =>
    paragraphFromInlines(
      item,
      {},
      block.ordered ? orderedListOptions() : { bullet: { level: 0 } },
      images,
    ),
  )

const tableFromBlock = (
  block: Extract<MarkdownBlock, { type: 'table' }>,
  images: DocxImageMap,
): Table => {
  const rows = [block.header, ...block.rows].filter((row) => row.length > 0)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, index) => tableRow(row, index === 0, images)),
  })
}

const tableRow = (cells: MarkdownInline[][], header: boolean, images: DocxImageMap): TableRow =>
  new TableRow({
    children: cells.map(
      (cell) =>
        new TableCell({
          children: [
            paragraphFromInlines(
              cell,
              header ? { bold: true } : {},
              { spacing: { after: 0 } },
              images,
            ),
          ],
        }),
    ),
  })

const orderedListOptions = (): Partial<IParagraphOptions> => ({
  numbering: { reference: orderedListReference, level: 0 },
})

const headingLevel = (level: number): HeadingLevelValue => {
  if (level <= 1) return HeadingLevel.HEADING_1
  if (level === 2) return HeadingLevel.HEADING_2
  if (level === 3) return HeadingLevel.HEADING_3
  if (level === 4) return HeadingLevel.HEADING_4
  if (level === 5) return HeadingLevel.HEADING_5
  return HeadingLevel.HEADING_6
}

const blockquoteOptions = (): Partial<IParagraphOptions> => ({
  border: { left: { style: BorderStyle.SINGLE, color: 'CBD5E1', size: 8, space: 12 } },
  indent: { left: 360 },
  spacing: { after: 120 },
})

const tableRowText = (row: MarkdownInline[][]): string =>
  row.map((cell) => plainTextFromInlines(cell)).join(' | ')
