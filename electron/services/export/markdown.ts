import { parseBlocks } from '@electron/services/export/markdownBlocks.js'
import { normalizeHtmlBreaks } from '@electron/services/export/markdownText.js'
import type { MarkdownBlock } from '@electron/services/export/markdownTypes.js'

export type { MarkdownBlock, MarkdownInline } from '@electron/services/export/markdownTypes.js'
export { plainTextFromInlines } from '@electron/services/export/markdownInlines.js'

export const parseMarkdown = (markdown: string): MarkdownBlock[] => {
  const lines = normalizeMarkdownForExport(markdown).split(/\r?\n/)
  return parseBlocks(lines)
}

export const normalizeMarkdownForExport = (markdown: string): string => {
  return normalizeHtmlBreaks(markdown)
}
