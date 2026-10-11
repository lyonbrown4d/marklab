import {
  AlignmentType,
  convertMillimetersToTwip,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx'
import type { FileChild, ISectionOptions } from 'docx'
import { parseMarkdown } from '@electron/services/export/markdown'
import { blocksToDocxChildren } from '@electron/services/export/docxContent'
import { loadDocxImages } from '@electron/services/export/docxImages'
import type { WorkspacePublicationSource } from '@electron/services/export/workspacePublicationHtml'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'

const orderedListReference = 'marklab-ordered-list'

export const renderWorkspacePublicationDocx = async (
  chapters: WorkspacePublicationSource[],
  options: WorkspacePublicationOptions,
): Promise<Buffer> => {
  const labels = publicationLabels(options.locale, chapters.length)
  const chapterChildren = await Promise.all(
    chapters.map(async (chapter, index) => {
      const blocks = parseMarkdown(chapter.markdown)
      const images = await loadDocxImages(blocks, { readImage: chapter.readImage })
      const children = blocksToDocxChildren(blocks, images)
      const fallbackHeading = new Paragraph({
        heading: HeadingLevel.HEADING_1,
        text: chapter.title,
      })
      return [
        ...(options.pageBreaks && index > 0 ? [new Paragraph({ pageBreakBefore: true })] : []),
        ...(blocks.some((block) => block.type === 'heading' && block.level === 1)
          ? []
          : [fallbackHeading]),
        ...children,
      ]
    }),
  )
  const children: FileChild[] = [
    ...(options.cover ? coverChildren(options.title, chapters.length, labels.chapterCount) : []),
    ...(options.tableOfContents ? tocChildren(labels.contents) : []),
    ...chapterChildren.flat(),
  ]
  const document = new Document({
    creator: 'Marklab',
    title: options.title,
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
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [section(options, children.length > 0 ? children : [new Paragraph('')])],
  })
  return Packer.toBuffer(document)
}

const coverChildren = (title: string, chapterCount: number, chapterLabel: string): FileChild[] => [
  new Paragraph({
    children: [new TextRun({ text: 'MARKLAB', bold: true, color: '2563EB', size: 20 })],
    spacing: { before: 2200, after: 700 },
  }),
  new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 54 })],
    spacing: { after: 300 },
  }),
  new Paragraph({
    children: [new TextRun({ text: `${chapterCount} ${chapterLabel}`, color: '64748B', size: 22 })],
  }),
  new Paragraph({ pageBreakBefore: true }),
]

const tocChildren = (contentsLabel: string): FileChild[] => [
  new Paragraph({ heading: HeadingLevel.HEADING_1, text: contentsLabel }),
  new TableOfContents(contentsLabel, { headingStyleRange: '1-3', hyperlink: true }),
  new Paragraph({ pageBreakBefore: true }),
]

const section = (options: WorkspacePublicationOptions, children: FileChild[]): ISectionOptions => {
  const dimensions = pageDimensions(options.pageSize, options.orientation)
  const marginMm = options.margin === 'narrow' ? 12 : options.margin === 'wide' ? 26 : 18
  return {
    children,
    footers: options.pageNumbers
      ? {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT] })],
              }),
            ],
          }),
        }
      : undefined,
    properties: {
      page: {
        margin: {
          bottom: convertMillimetersToTwip(marginMm),
          left: convertMillimetersToTwip(marginMm),
          right: convertMillimetersToTwip(marginMm),
          top: convertMillimetersToTwip(marginMm),
        },
        size: {
          height: convertMillimetersToTwip(dimensions.height),
          orientation:
            options.orientation === 'landscape'
              ? PageOrientation.LANDSCAPE
              : PageOrientation.PORTRAIT,
          width: convertMillimetersToTwip(dimensions.width),
        },
      },
    },
  }
}

const pageDimensions = (
  size: WorkspacePublicationOptions['pageSize'],
  orientation: WorkspacePublicationOptions['orientation'],
): { height: number; width: number } => {
  const portrait =
    size === 'a5'
      ? { width: 148, height: 210 }
      : size === 'letter'
        ? { width: 215.9, height: 279.4 }
        : { width: 210, height: 297 }
  return orientation === 'landscape' ? { width: portrait.height, height: portrait.width } : portrait
}

const publicationLabels = (locale: WorkspacePublicationOptions['locale'], chapterCount: number) =>
  locale === 'zh-CN'
    ? { chapterCount: '章', contents: '目录' }
    : { chapterCount: chapterCount === 1 ? 'chapter' : 'chapters', contents: 'Contents' }
