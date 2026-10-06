import { ExternalHyperlink, ImageRun, Paragraph, TextRun } from 'docx'
import type { IParagraphOptions, ParagraphChild } from 'docx'
import type { MarkdownInline } from '@electron/services/export/markdown'
import type { DocxImageMap } from '@electron/services/export/docxImages'

export type InlineStyle = {
  bold?: boolean
  italics?: boolean
  code?: boolean
  color?: string
  underline?: boolean
  strike?: boolean
}
const monospaceFont = 'Consolas'
const defaultTextColor = '111827'
const linkColor = '2563EB'

export const paragraphFromInlines = (
  inlines: MarkdownInline[],
  style: InlineStyle = {},
  options: Partial<IParagraphOptions> = {},
  images: DocxImageMap = new Map(),
): Paragraph =>
  new Paragraph({
    ...options,
    children: inlineChildren(inlines, style, images),
    spacing: { after: 120, ...('spacing' in options ? options.spacing : {}) },
  })

export const inlineChildren = (
  inlines: MarkdownInline[],
  style: InlineStyle = {},
  images: DocxImageMap = new Map(),
): ParagraphChild[] => {
  const children = inlines.flatMap((inline) => inlineToChildren(inline, style, images))
  return children.length > 0 ? children : [new TextRun('')]
}

const inlineToChildren = (
  inline: MarkdownInline,
  style: InlineStyle,
  images: DocxImageMap,
): ParagraphChild[] => {
  if (inline.type === 'text') return textRuns(inline.text, style)
  if (inline.type === 'code') return textRuns(inline.text, { ...style, code: true })
  if (inline.type === 'strong')
    return inlineChildren(inline.children, { ...style, bold: true }, images)
  if (inline.type === 'emphasis')
    return inlineChildren(inline.children, { ...style, italics: true }, images)
  if (inline.type === 'deletion')
    return inlineChildren(inline.children, { ...style, strike: true }, images)
  if (inline.type === 'image') return imageChildren(inline, style, images)
  if (inline.type === 'link') return linkChildren(inline, style, images)
  return []
}

const imageChildren = (
  inline: Extract<MarkdownInline, { type: 'image' }>,
  style: InlineStyle,
  images: DocxImageMap,
): ParagraphChild[] => {
  const image = images.get(inline.url)
  if (!image) return textRuns(inline.alt || inline.url, { ...style, italics: true })
  return [
    new ImageRun({
      ...image,
      transformation: { width: 520, height: 320 },
      altText: {
        name: inline.alt || 'Markdown image',
        description: inline.alt || inline.url,
        title: inline.title || inline.alt || 'Markdown image',
      },
    }),
  ]
}

const linkChildren = (
  inline: Extract<MarkdownInline, { type: 'link' }>,
  style: InlineStyle,
  images: DocxImageMap,
): ParagraphChild[] => {
  const children = inlineChildren(
    inline.children,
    { ...style, color: linkColor, underline: true },
    images,
  )
  if (!/^https?:\/\//i.test(inline.url) && !/^mailto:/i.test(inline.url)) return children
  return [new ExternalHyperlink({ link: inline.url, children })]
}

export const textRuns = (text: string, style: InlineStyle): TextRun[] =>
  text.split('\n').flatMap((part, index) => {
    const runs: TextRun[] = []
    if (index > 0) runs.push(new TextRun({ break: 1 }))
    if (part) runs.push(textRun(part, style))
    return runs
  })

const textRun = (text: string, style: InlineStyle): TextRun =>
  new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    underline: style.underline ? {} : undefined,
    color: style.color ?? defaultTextColor,
    font: style.code ? monospaceFont : undefined,
  })
