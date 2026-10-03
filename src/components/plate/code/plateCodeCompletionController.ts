import type { CompletionItem, CompletionList, Position } from 'vscode-languageserver-types'
import {
  createEmbeddedLanguageSession,
  type EmbeddedDocumentChange,
  type EmbeddedLanguageClient,
} from '@/components/editor/language/embeddedLanguageSession'

const offsetToPosition = (text: string, offset: number): Position => {
  const prefix = text.slice(0, Math.min(Math.max(offset, 0), text.length))
  const lines = prefix.split('\n')
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 }
}

export const createIncrementalTextChange = (
  previous: string,
  next: string,
): EmbeddedDocumentChange | null => {
  if (previous === next) return null
  let start = 0
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start += 1
  }
  let previousEnd = previous.length
  let nextEnd = next.length
  while (
    previousEnd > start &&
    nextEnd > start &&
    previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd -= 1
    nextEnd -= 1
  }
  return {
    range: {
      start: offsetToPosition(previous, start),
      end: offsetToPosition(previous, previousEnd),
    },
    rangeLength: previousEnd - start,
    text: next.slice(start, nextEnd),
  }
}

const normalizeItems = (result: CompletionItem[] | CompletionList | null) =>
  Array.isArray(result) ? result : (result?.items ?? [])

type CompletionControllerOptions = {
  client: EmbeddedLanguageClient
  uri: string
  languageId: string
  text: string
  onCompletions: (items: CompletionItem[]) => void
  onError?: (error: unknown) => void
}

export const createPlateCodeCompletionController = (options: CompletionControllerOptions) => {
  const session = createEmbeddedLanguageSession(options)
  let text = options.text
  let request = 0
  let closed = false

  const updateText = (next: string) => {
    if (closed) return
    const change = createIncrementalTextChange(text, next)
    text = next
    if (change) session.change([change])
  }
  const complete = async (position: Position) => {
    if (closed) return
    const currentRequest = ++request
    try {
      const items = normalizeItems(await session.completion(position))
      if (!closed && currentRequest === request) options.onCompletions(items)
    } catch (error) {
      if (!closed && currentRequest === request) {
        options.onCompletions([])
        options.onError?.(error)
      }
    }
  }
  const cancel = () => {
    request += 1
    options.onCompletions([])
  }
  const close = async () => {
    if (closed) return
    closed = true
    request += 1
    await session.close()
  }

  return { cancel, close, complete, updateText }
}
