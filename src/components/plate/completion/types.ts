import type { DecoratedRange, NodeEntry, Point } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type { PlateInlineCompletionContext } from '@/components/plate/completion/plateInlineCompletionContext'

export type PlateInlineCompletionCandidate = {
  source: 'ai' | 'document'
  text: string
}

export type PlateInlineCompletionResult =
  | PlateInlineCompletionCandidate
  | string
  | readonly (PlateInlineCompletionCandidate | string)[]
  | null
  | undefined

export type PlateInlineCompletionState = {
  anchor: Point
  candidates: readonly PlateInlineCompletionCandidate[]
  index: number
}

export type PlateInlineCompletionDecoration = DecoratedRange & {
  plateInlineCompletion: string
  plateInlineCompletionSource: PlateInlineCompletionCandidate['source']
}

export type PlateInlineCompletionControllerOptions = {
  canComplete: (context: PlateInlineCompletionContext) => boolean
  characterBudget?: number
  debounceMs: () => number
  enabled: () => boolean
  getDocumentCompletions?: (
    context: PlateInlineCompletionContext,
  ) => readonly PlateInlineCompletionCandidate[]
  getDocumentKey?: () => string | null
  maxCandidates?: number
  requestCompletion: (
    context: PlateInlineCompletionContext,
    excluded: readonly string[],
    signal: AbortSignal,
  ) => Promise<PlateInlineCompletionResult>
}

export type PlateInlineCompletionController = {
  activate: () => void
  compositionEnd: () => void
  compositionStart: () => void
  decorate: (entry: NodeEntry) => PlateInlineCompletionDecoration[]
  destroy: () => void
  getSnapshot: () => PlateInlineCompletionState | null
  keyDown: (event: KeyboardEvent) => boolean
  subscribe: (listener: () => void) => () => void
  sync: () => void
}

export type UsePlateInlineCompletionOptions = {
  activePath: string | null
  editor: PlateEditor
  readOnly: boolean
  value: string
}
