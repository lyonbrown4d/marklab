import { exactCompletionContinuation } from '@/logic/documentCompletionEntryExtractor'
import type { CompletionIndexedEntry } from '@/logic/documentCompletionIncrementalState'
import { normalizeCompletionCandidateKey } from '@/logic/documentCompletionTokenizer'

export type DocumentCompletionCandidate = { score: number; source: 'document'; text: string }

type RankedCandidate = DocumentCompletionCandidate & { dedupeKey: string }

type RankCompletionCandidatesOptions = {
  cursor: number
  maxCandidateLength: number
  maxCandidates: number
  positionOf: (entry: CompletionIndexedEntry) => number
  prefix: string
  results: readonly { item: CompletionIndexedEntry }[]
  sourceLength: number
}

export const rankCompletionCandidates = ({
  cursor,
  maxCandidateLength,
  maxCandidates,
  positionOf,
  prefix,
  results,
  sourceLength,
}: RankCompletionCandidatesOptions): DocumentCompletionCandidate[] => {
  const ranked = new Map<string, RankedCandidate>()
  for (const result of results) {
    const exact = exactCompletionContinuation(result.item.text, prefix)
    if (!exact) continue
    const text = exact.text.slice(0, maxCandidateLength)
    const dedupeKey = normalizeCompletionCandidateKey(text)
    if (!dedupeKey || text.trim().length < 1) continue
    const proximity = Math.min(
      1,
      Math.abs(cursor - positionOf(result.item)) / Math.max(1, sourceLength),
    )
    const score =
      exact.exactRank * 10 -
      result.item.weight * 2 -
      Math.min(result.item.frequency, 5) * 1.5 +
      proximity
    const candidate: RankedCandidate = { dedupeKey, score, source: 'document', text }
    const existing = ranked.get(dedupeKey)
    if (!existing || candidate.score < existing.score) ranked.set(dedupeKey, candidate)
  }
  return [...ranked.values()]
    .sort((left, right) => left.score - right.score)
    .slice(0, maxCandidates)
    .map(({ score, source, text }) => ({ score, source, text }))
}
