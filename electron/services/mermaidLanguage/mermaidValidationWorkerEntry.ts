import { parentPort } from 'node:worker_threads'

import { validateWithOfficialMermaidParser } from '@electron/services/mermaidLanguage/validationWorkerParser'
import type {
  MermaidValidationError,
  MermaidValidationWorkerRequest,
  MermaidValidationWorkerResponse,
} from '@electron/services/mermaidLanguage/validationWorkerMessages'

const cancelled = new Set<number>()
const running = new Set<number>()
let validationQueue = Promise.resolve()

parentPort?.on('message', (request: MermaidValidationWorkerRequest) => {
  if (request.type === 'cancel') {
    if (running.has(request.id)) cancelled.add(request.id)
    return
  }
  running.add(request.id)
  validationQueue = validationQueue.then(() => runValidation(request))
})

const runValidation = async (
  request: Extract<MermaidValidationWorkerRequest, { type: 'validate' }>,
): Promise<void> => {
  try {
    if (cancelled.delete(request.id)) return
    const issues = await validateWithOfficialMermaidParser(request.document.text)
    postUnlessCancelled({ id: request.id, ok: true, issues })
  } catch (error) {
    postUnlessCancelled({ id: request.id, ok: false, error: serializableError(error) })
  } finally {
    running.delete(request.id)
    cancelled.delete(request.id)
  }
}

const postUnlessCancelled = (response: MermaidValidationWorkerResponse): void => {
  if (cancelled.delete(response.id)) return
  parentPort?.postMessage(response)
}

const serializableError = (error: unknown): MermaidValidationError => {
  const value = objectValue(error)
  const hash = objectValue(safeProperty(value, 'hash'))
  const location = objectValue(safeProperty(hash, 'loc'))
  const firstLine = finiteNumber(safeProperty(location, 'first_line'))
  const firstColumn = finiteNumber(safeProperty(location, 'first_column'))
  const lastLine = finiteNumber(safeProperty(location, 'last_line'))
  const lastColumn = finiteNumber(safeProperty(location, 'last_column'))
  return {
    message: boundedMessage(error),
    ...(firstLine == null || firstColumn == null || lastLine == null || lastColumn == null
      ? {}
      : {
          location: { firstColumn, firstLine, lastColumn, lastLine },
        }),
  }
}

const boundedMessage = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof safeProperty(objectValue(error), 'message') === 'string'
        ? String(safeProperty(objectValue(error), 'message'))
        : 'Mermaid syntax validation failed.'
  return message.slice(0, 500)
}

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null

const safeProperty = (value: Record<string, unknown> | null, key: string): unknown => {
  if (!value) return undefined
  try {
    return value[key]
  } catch {
    return undefined
  }
}

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
