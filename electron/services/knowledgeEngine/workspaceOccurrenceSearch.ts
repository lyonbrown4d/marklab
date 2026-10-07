import type { FsSearchResult } from '@electron/services/workspace/types'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'

export type OccurrenceSearchInput = {
  caseSensitive: boolean
  limit: number
  query: string
  useRegex: boolean
  wholeWord: boolean
}

export type OccurrenceSearchOutput = {
  results: FsSearchResult[]
  totalHits: number
}

const MAX_SNIPPET_LENGTH = 240
const wordCharacter = /[\p{L}\p{N}_]/u

export const searchWorkspaceOccurrences = (
  documents: WorkspaceSearchDocument[],
  input: OccurrenceSearchInput,
): OccurrenceSearchOutput => {
  const matcher = createMatcher(input)
  const results: FsSearchResult[] = []
  let totalHits = 0

  for (const document of documents) {
    const lineStarts = collectLineStarts(document.content)
    for (const match of matcher(document.content)) {
      if (input.wholeWord && !isWholeWord(document.content, match.start, match.end)) continue
      totalHits += 1
      if (results.length >= input.limit) continue
      results.push(toSearchResult(document, lineStarts, match.start, match.end))
    }
  }

  return { results, totalHits }
}

type TextMatch = { start: number; end: number }
type TextMatcher = (content: string) => Iterable<TextMatch>

const createMatcher = (input: OccurrenceSearchInput): TextMatcher => {
  const source = input.useRegex ? input.query : escapeRegularExpression(input.query)
  const expression = new RegExp(source, input.caseSensitive ? 'gu' : 'giu')
  return function* match(content: string): Iterable<TextMatch> {
    expression.lastIndex = 0
    for (let current = expression.exec(content); current; current = expression.exec(content)) {
      const start = current.index
      const end = start + current[0].length
      if (end > start) yield { end, start }
      if (current[0].length === 0) expression.lastIndex = advanceCodePoint(content, start)
    }
  }
}

const escapeRegularExpression = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const collectLineStarts = (content: string): number[] => {
  const starts = [0]
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

const lineIndexAt = (starts: number[], offset: number): number => {
  let low = 0
  let high = starts.length
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if ((starts[middle] ?? 0) <= offset) low = middle
    else high = middle
  }
  return low
}

const toSearchResult = (
  document: WorkspaceSearchDocument,
  lineStarts: number[],
  start: number,
  end: number,
): FsSearchResult => {
  const lineIndex = lineIndexAt(lineStarts, start)
  const lineStart = lineStarts[lineIndex] ?? 0
  const nextLineStart = lineStarts[lineIndex + 1] ?? document.content.length + 1
  const rawLineEnd = Math.min(document.content.length, nextLineStart - 1)
  const lineEnd = document.content.charCodeAt(rawLineEnd - 1) === 13 ? rawLineEnd - 1 : rawLineEnd
  const window = snippetWindow(lineStart, lineEnd, start, end)
  return {
    column: start - lineStart + 1,
    end_column: Math.min(end, lineEnd) - lineStart + 1,
    line: lineIndex + 1,
    path: document.path,
    score: 1,
    snippet: document.content.slice(window.start, window.end),
    snippet_highlights: [
      {
        end: Math.min(end, window.end) - window.start,
        start: Math.max(start, window.start) - window.start,
      },
    ],
    title: document.title,
  }
}

const snippetWindow = (
  lineStart: number,
  lineEnd: number,
  matchStart: number,
  matchEnd: number,
): TextMatch => {
  if (lineEnd - lineStart <= MAX_SNIPPET_LENGTH) return { start: lineStart, end: lineEnd }
  const matchMiddle = Math.floor((matchStart + Math.min(matchEnd, lineEnd)) / 2)
  const start = Math.max(lineStart, matchMiddle - Math.floor(MAX_SNIPPET_LENGTH / 2))
  return {
    start: Math.min(start, lineEnd - MAX_SNIPPET_LENGTH),
    end: Math.min(lineEnd, start + MAX_SNIPPET_LENGTH),
  }
}

const isWholeWord = (content: string, start: number, end: number): boolean =>
  !wordCharacter.test(codePointBefore(content, start)) &&
  !wordCharacter.test(codePointAt(content, end))

const codePointBefore = (content: string, offset: number): string => {
  if (offset <= 0) return ''
  const previous = content.charCodeAt(offset - 1)
  const start = previous >= 0xdc00 && previous <= 0xdfff ? offset - 2 : offset - 1
  return content.slice(Math.max(0, start), offset)
}

const codePointAt = (content: string, offset: number): string => {
  const point = content.codePointAt(offset)
  return point === undefined ? '' : String.fromCodePoint(point)
}

const advanceCodePoint = (content: string, offset: number): number => {
  const point = content.codePointAt(offset)
  return offset + (point !== undefined && point > 0xffff ? 2 : 1)
}
