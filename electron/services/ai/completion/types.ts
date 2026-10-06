export type AiInlineCompletionEvent =
  | { requestId: string; type: 'delta'; delta: string }
  | {
      requestId: string
      type: 'finish'
      finishReason: string
      usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
      warnings: string[]
    }
  | { requestId: string; type: 'error'; message: string }
  | { requestId: string; type: 'cancelled' }

export type AiInlineCompletionEventHandler = (event: AiInlineCompletionEvent) => void

export type AiInlineCompletionServiceContract = {
  start: (
    ownerId: number,
    input: unknown,
    emit: AiInlineCompletionEventHandler,
  ) => Promise<{ requestId: string }>
  cancelGeneration: (ownerId: number, requestId: string) => Promise<boolean>
  cancelOwner: (ownerId: number) => Promise<void>
}
