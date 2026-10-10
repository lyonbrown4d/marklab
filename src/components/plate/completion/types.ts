import type { DecoratedRange, NodeEntry, Point } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type { PlateInlineCompletionContext } from '@/components/plate/completion/plateInlineCompletionContext'

export type PlateInlineDocumentCompletion = {
  source: 'document'
  text: string
}

export type PlateInlineAiCompletion = {
  source: 'ai'
  text: string
}

export type PlateInlineCompletionCandidate = PlateInlineDocumentCompletion | PlateInlineAiCompletion

export type PlateInlineCompletionResult =
  | PlateInlineCompletionCandidate
  | string
  | readonly (PlateInlineCompletionCandidate | string)[]
  | null
  | undefined

type PlateInlineCompletionStateBase = {
  anchor: Point
}

export type PlateInlineDocumentCompletionState = PlateInlineCompletionStateBase & {
  candidates: readonly PlateInlineDocumentCompletion[]
  index: number
  kind: 'document'
}

export type PlateInlineAiCompletionState = PlateInlineCompletionStateBase & {
  candidates: readonly []
  completion: PlateInlineAiCompletion
  kind: 'ai'
}

export type PlateInlineCompletionState =
  PlateInlineDocumentCompletionState | PlateInlineAiCompletionState

type PlateInlineCompletionDecorationBase = DecoratedRange & {
  plateInlineCompletionAccept: (index?: number) => boolean
}

export type PlateInlineDocumentCompletionDecoration = PlateInlineCompletionDecorationBase & {
  plateInlineCompletionCandidates: readonly PlateInlineDocumentCompletion[]
  plateInlineCompletionIndex: number
  plateInlineCompletionKind: 'document'
}

export type PlateInlineAiCompletionDecoration = PlateInlineCompletionDecorationBase & {
  plateInlineCompletion: string
  plateInlineCompletionKind: 'ai'
}

export type PlateInlineCompletionDecoration =
  PlateInlineDocumentCompletionDecoration | PlateInlineAiCompletionDecoration

export type PlateInlineCompletionControllerOptions = {
  canComplete: (context: PlateInlineCompletionContext) => boolean
  characterBudget?: number
  debounceMs: () => number
  enabled: () => boolean
  getDocumentCompletions?: (
    context: PlateInlineCompletionContext,
  ) => readonly PlateInlineDocumentCompletion[]
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
  compositionEnd: (schedule?: boolean) => void
  compositionStart: () => void
  deactivate: () => void
  decorate: (entry: NodeEntry) => PlateInlineCompletionDecoration[]
  destroy: () => void
  dismiss: () => void
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
