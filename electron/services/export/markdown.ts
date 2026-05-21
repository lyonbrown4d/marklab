import { parseBlocks } from './markdownBlocks.js'
import { normalizeHtmlBreaks } from './markdownText.js'
import type { MarkdownBlock } from './markdownTypes.js'

export type { MarkdownBlock, MarkdownInline } from './markdownTypes.js'
export { plainTextFromInlines } from './markdownInlines.js'

export const parseMarkdown = (markdown: string): MarkdownBlock[] => {
  const lines = normalizeMarkdownForExport(markdown).split(/\r?\n/)
  return parseBlocks(lines)
}

export const normalizeMarkdownForExport = (markdown: string): string => {
  return normalizeHtmlBreaks(markdown)
}
