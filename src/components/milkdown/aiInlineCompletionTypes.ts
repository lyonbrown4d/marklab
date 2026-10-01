import type { AiInlineCompletionContext } from '@/components/milkdown/aiInlineCompletionContext'

export type AiInlineCompletionCandidate = {
  source: 'ai' | 'document'
  text: string
}

export type AiInlineCompletionResult =
  | AiInlineCompletionCandidate
  | string
  | readonly (AiInlineCompletionCandidate | string)[]
  | null
  | undefined

export type AiInlineCompletionOptions = {
  canComplete: (context: AiInlineCompletionContext) => boolean
  characterBudget?: number
  debounceMs?: number
  enabled: () => boolean
  getDocumentCompletions?: (
    context: AiInlineCompletionContext,
  ) => readonly AiInlineCompletionCandidate[]
  getDocumentKey?: () => string | null
  maxCandidates?: number
  requestCompletion: (
    context: AiInlineCompletionContext,
    excluded: readonly string[],
    signal: AbortSignal,
  ) => Promise<AiInlineCompletionResult>
  subscribeDocumentKey?: (listener: () => void) => () => void
  subscribeEnabled?: (listener: () => void) => () => void
}

export type AiInlineCompletionState = {
  anchor: number
  candidates: readonly AiInlineCompletionCandidate[]
  index: number
}

export type AiInlineCompletionMeta =
  { type: 'clear' } | { type: 'set'; value: AiInlineCompletionState }
