import type { AiGenerationEvent } from '@/services/aiApi'
import { aiCompletionApi } from '@/services/aiCompletionApi'
import type { AiInlineCompletionRequest } from '@/types/aiCompletion'

type Unlisten = () => void

export type AiInlineCompletionTransport = {
  cancelGeneration: (requestId: string) => Promise<void>
  onGenerationEvent: (handler: (event: AiGenerationEvent) => void) => Promise<Unlisten> | Unlisten
  startInlineCompletion: (input: AiInlineCompletionRequest) => Promise<{ requestId: string }>
}

const abortError = () => {
  const error = new Error('AI inline completion request was cancelled')
  error.name = 'AbortError'
  return error
}

export const requestAiInlineCompletion = async (
  input: AiInlineCompletionRequest,
  signal: AbortSignal,
  transport: AiInlineCompletionTransport = aiCompletionApi,
): Promise<string | null> => {
  if (signal.aborted) throw abortError()

  let activeRequestId: string | null = null
  let completed = false
  let unlisten: Unlisten = () => undefined
  const bufferedEvents: AiGenerationEvent[] = []
  const deltas: string[] = []
  let resolveTerminal: (value: string | null) => void = () => undefined
  let rejectTerminal: (reason: unknown) => void = () => undefined
  const terminal = new Promise<string | null>((resolve, reject) => {
    resolveTerminal = resolve
    rejectTerminal = reject
  })
  void terminal.catch(() => undefined)

  const settle = (event: AiGenerationEvent) => {
    if (completed || event.requestId !== activeRequestId) return
    if (event.type === 'delta') {
      deltas.push(event.delta)
      return
    }
    completed = true
    if (event.type === 'finish') resolveTerminal(deltas.join('') || null)
    else if (event.type === 'error') rejectTerminal(new Error(event.message))
    else rejectTerminal(abortError())
  }
  const handleEvent = (event: AiGenerationEvent) => {
    if (activeRequestId) settle(event)
    else bufferedEvents.push(event)
  }
  const handleAbort = () => {
    if (completed) return
    completed = true
    rejectTerminal(abortError())
    if (activeRequestId) {
      void transport.cancelGeneration(activeRequestId).catch(() => undefined)
    }
  }

  signal.addEventListener('abort', handleAbort, { once: true })
  try {
    unlisten = await transport.onGenerationEvent(handleEvent)
    if (signal.aborted) throw abortError()
    const started = await transport.startInlineCompletion(input)
    activeRequestId = started.requestId
    if (signal.aborted) {
      void transport.cancelGeneration(activeRequestId).catch(() => undefined)
      throw abortError()
    }
    bufferedEvents.forEach(settle)
    bufferedEvents.length = 0
    return await terminal
  } finally {
    signal.removeEventListener('abort', handleAbort)
    unlisten()
  }
}
