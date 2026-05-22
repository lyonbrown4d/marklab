import type { FsSearchResult } from '@electron/services/workspace/types.js'
import { charLength, sliceChars } from '@electron/services/workspace/markdown/text.js'

export type SearchRow = {
  path: string
  title: string
  line_no: number
  line_text: string
  rank: number
}

type MatchRange = {
  start: number
  end: number
}

export const buildMatchExpression = (terms: string[]): string => {
  const normalized = terms.map((term) => escapeFtsTerm(term)).filter(Boolean)
  if (normalized.length === 0) return ''
  return normalized
    .map((term) => {
      const token = term.includes(' ') ? `"${term}"` : term
      return `(path:${token} OR title:${token} OR body:${token})`
    })
    .join(' AND ')
}

export const toSearchResult = (row: SearchRow, terms: string[]): FsSearchResult => {
  const line = Number(row.line_no) || 1
  const normalizedLine = row.line_text.normalize('NFKC')
  const normalizedLineFolded = normalizedLine.toLocaleLowerCase()
  const occurrences = findTermOccurrences(normalizedLineFolded, terms)
  const bestMatch = occurrences[0]
  const lineLength = charLength(normalizedLine)
  const defaultStart = 0
  const bestStart = bestMatch ? bestMatch.start : 0
  const bestEnd = bestMatch ? bestMatch.end : 0
  const snippetLength = Math.min(lineLength, 220)
  const snippetStart = bestMatch
    ? Math.max(0, Math.min(bestStart, Math.max(0, lineLength - snippetLength)))
    : defaultStart
  const snippetEnd = bestMatch
    ? Math.min(lineLength, Math.max(bestEnd, snippetStart + snippetLength))
    : snippetLength
  const snippetLine = sliceChars(normalizedLine, snippetStart, snippetEnd).trim()
  const snippet = snippetLine || row.title
  const snippetFolded = snippet.normalize('NFKC').toLocaleLowerCase()
  const snippetHighlights = findTermOccurrences(snippetFolded, terms).map(({ start, end }) => ({
    start,
    end,
  }))
  const normalizedPath = row.path.normalize('NFKC').toLocaleLowerCase()
  const normalizedTitle = row.title.normalize('NFKC').toLocaleLowerCase()
  const pathTitleHit = terms.some(
    (term) => normalizedPath.includes(term) || normalizedTitle.includes(term),
  )
  const baseScore = -Number(row.rank)
  const scoreBonus =
    (pathTitleHit ? 1.2 : 0) +
    (occurrences.length > 0 ? Math.min(2.0, occurrences.length * 0.35) : 0)

  return {
    path: row.path,
    title: row.title,
    line,
    column: bestMatch ? bestMatch.start + 1 : 1,
    end_column: bestMatch ? Math.max(bestMatch.end + 1, 2) : 1,
    snippet,
    snippet_highlights: mergeRanges(
      clampHighlights(normalizeRanges(snippetHighlights), 0, charLength(snippet)),
    ),
    score: baseScore + scoreBonus,
  }
}

const escapeFtsTerm = (value: string): string => {
  return value
    .replace(/"/g, '""')
    .replace(/[:^"()]/g, ' ')
    .trim()
}

const normalizeRanges = (ranges: MatchRange[]): MatchRange[] => {
  return ranges
    .map((range) => ({
      start: Math.max(range.start, 0),
      end: Math.max(range.end, 0),
    }))
    .filter((range) => range.end > range.start)
}

const clampHighlights = (
  ranges: MatchRange[],
  startLimit: number,
  endLimit: number,
): MatchRange[] => {
  return ranges
    .map((range) => ({
      start: Math.max(startLimit, Math.min(range.start, endLimit)),
      end: Math.max(range.start, Math.min(range.end, endLimit)),
    }))
    .filter((range) => range.end > range.start)
}

const mergeRanges = (ranges: MatchRange[]): MatchRange[] => {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || right.end - left.end)
  const merged: MatchRange[] = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

const findTermOccurrences = (
  text: string,
  terms: string[],
): Array<{ start: number; end: number }> => {
  const ranges: Array<{ start: number; end: number }> = []
  for (const term of terms) {
    let from = 0
    while (from <= text.length) {
      const hit = text.indexOf(term, from)
      if (hit < 0) break
      ranges.push({ start: hit, end: hit + term.length })
      from = hit + Math.max(term.length, 1)
    }
  }
  return ranges.sort((left, right) => left.start - right.start || left.end - right.end)
}
