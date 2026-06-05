import { extractHeadings } from '@/logic/paths'

export type MarkdownDocumentStats = {
  lines: number
  words: number
}

export type MarkdownTextAnalysisResult = {
  outline: ReturnType<typeof extractHeadings>
  stats: MarkdownDocumentStats
}

export const EMPTY_MARKDOWN_TEXT_ANALYSIS: MarkdownTextAnalysisResult = {
  outline: [],
  stats: {
    lines: 0,
    words: 0,
  },
}

export const getMarkdownDocumentStats = (value: string): MarkdownDocumentStats => {
  const trimmed = value.trim()
  return {
    lines: value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length,
  }
}

export const analyzeMarkdownText = (content: string): MarkdownTextAnalysisResult => {
  if (!content) return EMPTY_MARKDOWN_TEXT_ANALYSIS

  return {
    outline: extractHeadings(content),
    stats: getMarkdownDocumentStats(content),
  }
}
