import { extractHeadings } from '@/logic/paths'

export type MarkdownDocumentStats = {
  characters: number
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
    characters: 0,
    lines: 0,
    words: 0,
  },
}

export const getMarkdownDocumentStats = (value: string): MarkdownDocumentStats => {
  let characters = value.length
  let lines = value.length === 0 ? 0 : 1
  let words = 0
  let end = 0
  // Walk whitespace runs without retaining a second document or an array of
  // every word/line. Keep JavaScript's existing UTF-16 and whitespace semantics.
  for (const match of value.matchAll(/\s+/g)) {
    if (match.index > end) words += 1
    const whitespace = match[0]
    characters -= whitespace.length
    end = match.index + whitespace.length
    for (let index = 0; index < whitespace.length; index += 1) {
      const character = whitespace.charCodeAt(index)
      if (character === 13) {
        lines += 1
        if (whitespace.charCodeAt(index + 1) === 10) index += 1
      } else if (character === 10) lines += 1
    }
  }
  if (end < value.length) words += 1
  return { characters, lines, words }
}

export const analyzeMarkdownText = (content: string): MarkdownTextAnalysisResult => {
  if (!content) return EMPTY_MARKDOWN_TEXT_ANALYSIS

  return {
    outline: extractHeadings(content),
    stats: getMarkdownDocumentStats(content),
  }
}
