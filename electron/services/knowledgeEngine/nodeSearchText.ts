import type { FsSearchResult } from '@electron/services/workspace/types'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import { foldSearchText } from '@electron/services/knowledgeEngine/nodeSearchNormalization'

type FoldedTextMap = {
  text: string
  starts: number[]
  ends: number[]
}

export const queryTerms = (query: string): string[] =>
  foldSearchText(query).split(/\s+/).filter(Boolean)

export const documentContainsAllTerms = (
  document: WorkspaceSearchDocument,
  terms: string[],
): boolean => {
  const haystack = foldSearchText(`${document.title}\n${document.path}\n${document.content}`)
  return terms.every((term) => haystack.includes(term))
}

export const resultForSearchDocument = (
  document: WorkspaceSearchDocument,
  query: string,
  indexedScore = 0,
  indexedMatches: string[] = [],
): FsSearchResult => {
  const exactTerms = queryTerms(query)
  const highlightTerms = uniqueTerms([
    ...exactTerms.filter((term) => foldSearchText(documentText(document)).includes(term)),
    ...indexedMatches.map(foldSearchText),
  ])
  const foldedTitle = foldSearchText(document.title)
  const foldedPath = foldSearchText(document.path)
  const foldedContent = foldSearchText(document.content)
  const titleMatches = exactTerms.every((term) => foldedTitle.includes(term))
  const lines = document.content.split(/\r?\n/)
  const lineIndex = titleMatches ? -1 : bestSnippetLineIndex(lines, exactTerms, highlightTerms)
  const snippet = titleMatches ? document.title : (lines[lineIndex] ?? document.title)
  const highlights = highlightsForSnippet(snippet, highlightTerms)
  const firstHighlight = highlights[0]
  const exactScore =
    12 * exactTerms.filter((term) => foldedTitle.includes(term)).length +
    8 * exactTerms.filter((term) => foldedPath.includes(term)).length +
    4 * exactTerms.filter((term) => foldedContent.includes(term)).length

  return {
    column: (firstHighlight?.start ?? 0) + 1,
    end_column: (firstHighlight?.end ?? 0) + 1,
    line: lineIndex >= 0 ? lineIndex + 1 : 1,
    path: document.path,
    score: exactScore || indexedScore,
    snippet,
    snippet_highlights: highlights,
    title: document.title,
  }
}

const documentText = (document: WorkspaceSearchDocument): string =>
  `${document.title}\n${document.path}\n${document.content}`

const uniqueTerms = (terms: string[]): string[] => [...new Set(terms.filter(Boolean))]

const bestSnippetLineIndex = (
  lines: string[],
  exactTerms: string[],
  highlightTerms: string[],
): number => {
  const foldedLines = lines.map(foldSearchText)
  const completeMatch = foldedLines.findIndex((line) =>
    exactTerms.every((term) => line.includes(term)),
  )
  if (completeMatch >= 0) return completeMatch
  return foldedLines.findIndex((line) => highlightTerms.some((term) => line.includes(term)))
}

const highlightsForSnippet = (
  snippet: string,
  terms: string[],
): Array<{ start: number; end: number }> => {
  const folded = foldTextWithOffsets(snippet)
  return terms
    .flatMap((term) => {
      const foldedStart = folded.text.indexOf(term)
      if (foldedStart < 0) return []
      const foldedEnd = foldedStart + term.length - 1
      const start = folded.starts[foldedStart]
      const end = folded.ends[foldedEnd]
      return start == null || end == null ? [] : [{ start, end }]
    })
    .sort((left, right) => left.start - right.start || left.end - right.end)
}

const foldTextWithOffsets = (value: string): FoldedTextMap => {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  let sourceOffset = 0
  for (const character of value) {
    const sourceEnd = sourceOffset + character.length
    const folded = foldSearchText(character)
    if (!folded && /\p{Mark}/u.test(character) && ends.length > 0) {
      ends[ends.length - 1] = sourceEnd
    }
    text += folded
    for (let offset = 0; offset < folded.length; offset += 1) {
      starts.push(sourceOffset)
      ends.push(sourceEnd)
    }
    sourceOffset = sourceEnd
  }
  return { ends, starts, text }
}
