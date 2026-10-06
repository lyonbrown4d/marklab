import type { LocalAiGenerationEvent } from '@electron/services/ai/local/types'

export type AiInlineCompletionEventHandler = (event: LocalAiGenerationEvent) => void

export type AiInlineCompletionServiceContract = {
  start: (
    ownerId: number,
    input: unknown,
    emit: AiInlineCompletionEventHandler,
  ) => Promise<{ requestId: string }>
  cancelGeneration: (ownerId: number, requestId: string) => Promise<boolean>
  cancelOwner: (ownerId: number) => Promise<void>
}
