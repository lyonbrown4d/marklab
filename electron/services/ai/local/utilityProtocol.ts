import type {
  LocalAiGenerationEvent,
  LocalAiRuntimeRequest,
  LocalAiRuntimeStatus,
} from '@electron/services/ai/local/types'

export type LocalAiUtilityRequest =
  | { type: 'generate'; request: LocalAiRuntimeRequest }
  | { type: 'cancel'; requestId: string }
  | { type: 'shutdown' }

export type LocalAiUtilityResponse =
  | { type: 'event'; event: LocalAiGenerationEvent }
  | { type: 'status'; status: Extract<LocalAiRuntimeStatus, 'loading' | 'ready'> }

export const isLocalAiUtilityRequest = (value: unknown): value is LocalAiUtilityRequest => {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'shutdown') return true
  if (value.type === 'cancel') return isBoundedString(value.requestId, 128)
  if (value.type !== 'generate' || !isRecord(value.request)) return false
  const request = value.request
  return (
    isBoundedString(request.requestId, 128) &&
    isBoundedString(request.modelPath, 32_768) &&
    isBoundedString(request.prompt, 100_000) &&
    optionalBoundedString(request.system, 50_000) &&
    optionalInteger(request.maxOutputTokens, 1, 8_192) &&
    optionalNumber(request.temperature, 0, 2)
  )
}

export const isLocalAiUtilityResponse = (value: unknown): value is LocalAiUtilityResponse => {
  if (!isRecord(value)) return false
  if (value.type === 'status') return value.status === 'loading' || value.status === 'ready'
  if (value.type !== 'event' || !isRecord(value.event)) return false
  const event = value.event
  if (!isBoundedString(event.requestId, 128) || typeof event.type !== 'string') return false
  if (event.type === 'delta') return typeof event.delta === 'string'
  if (event.type === 'error') return isBoundedString(event.message, 1_000)
  if (event.type === 'cancelled') return true
  return (
    event.type === 'finish' &&
    typeof event.finishReason === 'string' &&
    isRecord(event.usage) &&
    Array.isArray(event.warnings) &&
    event.warnings.every((warning) => typeof warning === 'string')
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

const optionalBoundedString = (value: unknown, max: number): boolean =>
  value === undefined || (typeof value === 'string' && value.length <= max)

const optionalInteger = (value: unknown, min: number, max: number): boolean =>
  value === undefined || (Number.isInteger(value) && Number(value) >= min && Number(value) <= max)

const optionalNumber = (value: unknown, min: number, max: number): boolean =>
  value === undefined || (typeof value === 'number' && value >= min && value <= max)
