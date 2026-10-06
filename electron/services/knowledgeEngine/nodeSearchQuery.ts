import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import {
  foldSearchText,
  isFuzzySearchTerm,
  searchWordTokens,
} from '@electron/services/knowledgeEngine/nodeSearchNormalization'

export type NodeSearchCandidate = WorkspaceSearchDocument & {
  indexedMatches: string[]
  score: number
}

export const exactFtsExpression = (terms: string[]): string | null => {
  const indexed = terms.filter(hasTrigram)
  return indexed.length > 0 ? indexed.map(quoteFtsTerm).join(' AND ') : null
}

export const fuzzyFtsExpression = (terms: string[]): string | null => {
  const groups = terms.flatMap((term) => {
    if (!hasTrigram(term)) return []
    if (!isFuzzySearchTerm(term)) return [quoteFtsTerm(term)]
    const trigrams = uniqueTrigrams(term)
    return trigrams.length > 0 ? [`(${trigrams.map(quoteFtsTerm).join(' OR ')})`] : []
  })
  return groups.length > 0 ? groups.join(' AND ') : null
}

export const matchSearchDocument = (
  document: WorkspaceSearchDocument,
  terms: string[],
): { indexedMatches: string[]; matches: boolean } => {
  const folded = foldSearchText(`${document.title}\n${document.path}\n${document.content}`)
  const words = searchWordTokens(folded)
  const indexedMatches: string[] = []
  for (const term of terms) {
    if (folded.includes(term)) {
      indexedMatches.push(term)
      continue
    }
    if (!isFuzzySearchTerm(term)) return { indexedMatches: [], matches: false }
    const fuzzyWord = words.find((word) => withinEditDistance(word, term, fuzzyDistance(term)))
    if (!fuzzyWord) return { indexedMatches: [], matches: false }
    indexedMatches.push(fuzzyWord)
  }
  return { indexedMatches, matches: true }
}

const hasTrigram = (term: string): boolean => [...term].length >= 3

const quoteFtsTerm = (term: string): string => `"${term.replaceAll('"', '""')}"`

const uniqueTrigrams = (term: string): string[] => {
  const characters = [...term]
  const trigrams = new Set<string>()
  for (let index = 0; index <= characters.length - 3; index += 1) {
    trigrams.add(characters.slice(index, index + 3).join(''))
  }
  return [...trigrams]
}

const fuzzyDistance = (term: string): number => Math.max(1, Math.floor(term.length * 0.2))

const withinEditDistance = (left: string, right: string, maximum: number): boolean => {
  if (Math.abs(left.length - right.length) > maximum) return false
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    let rowMinimum = current[0] ?? leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      const value = Math.min(
        (previous[rightIndex] ?? 0) + 1,
        (current[rightIndex - 1] ?? 0) + 1,
        substitution,
      )
      current.push(value)
      rowMinimum = Math.min(rowMinimum, value)
    }
    if (rowMinimum > maximum) return false
    previous = current
  }
  return (previous[right.length] ?? maximum + 1) <= maximum
}
