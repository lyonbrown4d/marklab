import type { FsSearchResult } from '@electron/services/workspace/types.js'
import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast.js'
import { headingLevelsByLine } from '@electron/services/workspace/markdown/headings.js'
import { charLength, sliceChars } from '@electron/services/workspace/markdown/text.js'
import { fileLabel } from '@electron/services/workspace/markdown/utils.js'

export type SearchTerm = {
  raw: string
  folded: string
}

type SearchCandidate = {
  line: number
  column: number
  endColumn: number
  snippet: string
  highlights: Array<{ start: number; end: number }>
  score: number
}

export const searchDocuments = (
  documents: Array<{ path: string; content: string }>,
  query: string,
  limit: number,
): FsSearchResult[] => {
  const terms = parseSearchTerms(query)
  if (terms.length === 0 || limit <= 0) return []

  const normalizedQuery = foldSearchText(query.trim())
  const cappedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const results: FsSearchResult[] = []

  for (const document of documents) {
    const title = fileLabel(document.path)
    const foldedPath = foldSearchText(document.path)
    const foldedTitle = foldSearchText(title)
    const foldedBody = foldSearchText(document.content)
    const searchable = `${foldedPath}\n${foldedTitle}\n${foldedBody}`
    if (!terms.every((term) => searchable.includes(term.folded))) continue

    const bestBody = bestBodyCandidate(document.content, terms)
    const titleScore = scoreText(foldedTitle, terms) * 36
    const pathScore = scoreText(foldedPath, terms) * 18
    const exactBonus = normalizedQuery
      ? exactQueryBonus([foldedTitle, foldedPath, foldedBody], normalizedQuery)
      : 0
    const candidate = bestBody ?? fallbackSearchCandidate(document.content, title, terms)

    results.push({
      path: document.path,
      title,
      line: candidate.line,
      column: candidate.column,
      end_column: candidate.endColumn,
      snippet: candidate.snippet,
      snippet_highlights: candidate.highlights,
      score: titleScore + pathScore + candidate.score + exactBonus,
    })
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column,
    )
    .slice(0, cappedLimit)
}

const bestBodyCandidate = (content: string, terms: SearchTerm[]): SearchCandidate | null => {
  const lines = content.split(/\r?\n/)
  const headingLevels = headingLevelsByLine(parseMarkdownAst(content))
  let best: SearchCandidate | null = null

  lines.forEach((line, index) => {
    const folded = foldSearchText(line)
    const occurrences = findTermOccurrences(folded, terms)
    if (occurrences.length === 0) return

    const firstOccurrence = occurrences[0]!
    const headingLevel = headingLevels.get(index + 1)
    const uniqueTerms = new Set(occurrences.map((occurrence) => occurrence.term.folded)).size
    const allTermsBonus = terms.every((term) => folded.includes(term.folded)) ? 18 : 0
    const headingBonus = headingLevel ? 38 - headingLevel * 3 : 0
    const density =
      occurrences.reduce((sum, occurrence) => sum + occurrence.term.raw.length, 0) /
      Math.max(charLength(line), 1)
    const score =
      occurrences.length * 11 + uniqueTerms * 8 + allTermsBonus + headingBonus + density * 20
    const candidate = createSearchCandidate(
      line,
      index + 1,
      firstOccurrence.start,
      firstOccurrence.end,
      terms,
      score,
    )

    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.line < best.line)
    ) {
      best = candidate
    }
  })

  return best
}

const fallbackSearchCandidate = (
  content: string,
  title: string,
  terms: SearchTerm[],
): SearchCandidate => {
  const firstLine = content
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim()
  const snippet = firstLine || title
  const folded = foldSearchText(snippet)
  const occurrence = findTermOccurrences(folded, terms)[0]
  const start = occurrence?.start ?? 0
  const end = occurrence?.end ?? Math.max(1, charLength(snippet))
  return createSearchCandidate(snippet, 1, start, end, terms, 1)
}

const createSearchCandidate = (
  line: string,
  lineNumber: number,
  matchStart: number,
  matchEnd: number,
  terms: SearchTerm[],
  score: number,
): SearchCandidate => {
  const snippetWindow = 180
  const lineLength = charLength(line)
  const start = Math.max(0, matchStart - 70)
  const end = Math.min(lineLength, Math.max(matchEnd + 70, start + snippetWindow))
  const snippetStart = Math.max(0, Math.min(start, Math.max(0, lineLength - snippetWindow)))
  const snippetEnd = Math.min(lineLength, Math.max(end, snippetStart + 1))
  const snippetWithPadding = sliceChars(line, snippetStart, snippetEnd)
  const snippet = snippetWithPadding.trim()
  const highlights = snippetHighlights(snippetWithPadding, terms)

  return {
    line: lineNumber,
    column: matchStart + 1,
    endColumn: Math.max(matchEnd + 1, matchStart + 2),
    snippet,
    highlights,
    score,
  }
}

export const parseSearchTerms = (query: string): SearchTerm[] => {
  const rawTerms: string[] = []
  const pattern = /"([^"]+)"|'([^']+)'|`([^`]+)`|(\S+)/g
  for (const match of query.matchAll(pattern)) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim()
    const normalized = raw.replace(/^["'`:+~*?()[\]-]+|["'`:+~*?()[\]-]+$/g, '')
    if (normalized) rawTerms.push(normalized)
  }

  const terms = rawTerms.length > 0 ? rawTerms : query.trim() ? [query.trim()] : []
  const deduped = new Map<string, SearchTerm>()
  for (const raw of terms) {
    const folded = foldSearchText(raw)
    if (folded) deduped.set(folded, { raw, folded })
  }
  return [...deduped.values()]
}

const scoreText = (text: string, terms: SearchTerm[]): number => {
  return terms.reduce((score, term) => score + countOccurrences(text, term.folded), 0)
}

const exactQueryBonus = (fields: string[], normalizedQuery: string): number => {
  return fields.some((field) => field.includes(normalizedQuery)) ? 30 : 0
}

const findTermOccurrences = (text: string, terms: SearchTerm[]) => {
  const occurrences: Array<{ start: number; end: number; term: SearchTerm }> = []
  for (const term of terms) {
    let from = 0
    while (from <= text.length) {
      const index = text.indexOf(term.folded, from)
      if (index < 0) break
      occurrences.push({ start: index, end: index + charLength(term.folded), term })
      from = index + Math.max(term.folded.length, 1)
    }
  }
  return occurrences.sort((a, b) => a.start - b.start || b.end - a.end)
}

const snippetHighlights = (
  snippetWithPadding: string,
  terms: SearchTerm[],
): Array<{ start: number; end: number }> => {
  const trimmed = snippetWithPadding.trim()
  const folded = foldSearchText(trimmed)
  const ranges = findTermOccurrences(folded, terms)
    .map((occurrence) => ({ start: occurrence.start, end: occurrence.end }))
    .filter(
      (range) => range.start >= 0 && range.end > range.start && range.start < charLength(trimmed),
    )

  return mergeRanges(
    ranges.map((range) => ({ start: range.start, end: Math.min(range.end, charLength(trimmed)) })),
  )
}

const mergeRanges = (
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> => {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
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

export const countOccurrences = (text: string, term: string): number => {
  let count = 0
  let from = 0
  while (from <= text.length) {
    const index = text.indexOf(term, from)
    if (index < 0) break
    count += 1
    from = index + Math.max(term.length, 1)
  }
  return count
}

export const foldSearchText = (value: string): string => {
  return value.normalize('NFKC').toLocaleLowerCase()
}
