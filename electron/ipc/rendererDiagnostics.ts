import type { NativeCommandHandler } from '@electron/ipc/commandInvoke.js'
import type { Logger } from '@electron/services/logger.js'
import type {
  RendererDiagnosticError,
  RendererDiagnosticLevel,
  RendererDiagnosticReport,
  RendererDiagnosticResult,
} from '@/types/rendererDiagnostics'

type RateState = { count: number; warned: boolean; windowStartedAt: number }
type RendererDiagnosticsOptions = { maxReportsPerMinute?: number; now?: () => number }

const levels = new Set<RendererDiagnosticLevel>(['debug', 'error', 'info', 'warn'])
const identifierPattern = /^[a-z0-9][a-z0-9.-]{0,63}$/

export const createRendererDiagnosticsHandler = (
  logger: Logger,
  options: RendererDiagnosticsOptions = {},
): NativeCommandHandler => {
  const maxReports = options.maxReportsPerMinute ?? 60
  const now = options.now ?? Date.now
  const rateByRenderer = new Map<number, RateState>()
  let lastPrunedAt = 0

  return (payload, event): RendererDiagnosticResult => {
    const rendererId = event.sender.id
    const timestamp = now()
    if (timestamp - lastPrunedAt >= 60_000) {
      for (const [id, candidate] of rateByRenderer) {
        if (timestamp - candidate.windowStartedAt >= 60_000) rateByRenderer.delete(id)
      }
      lastPrunedAt = timestamp
    }
    const current = rateByRenderer.get(rendererId)
    const state =
      !current || timestamp - current.windowStartedAt >= 60_000
        ? { count: 0, warned: false, windowStartedAt: timestamp }
        : current
    rateByRenderer.set(rendererId, state)

    if (state.count >= maxReports) {
      if (!state.warned) {
        logger.warn('renderer diagnostics rate limited', { rendererId })
        state.warned = true
      }
      return { ok: false, reason: 'rate-limited' }
    }

    state.count += 1
    const report = parseRendererDiagnosticReport(payload)
    const fields = {
      ...(report.error ? { error: report.error } : {}),
      ...(report.message ? { message: report.message } : {}),
      rendererId,
    }
    logger.child(report.scope)[report.level](report.event, fields)
    return { ok: true }
  }
}

const parseRendererDiagnosticReport = (value: unknown): RendererDiagnosticReport => {
  if (!value || typeof value !== 'object') throwInvalidReport()
  const input = value as Record<string, unknown>
  const level = parseLevel(input.level)
  const scope = parseIdentifier(input.scope)
  const event = parseIdentifier(input.event)
  const message = optionalBoundedString(input.message, 500)
  const error = parseError(input.error)
  return {
    ...(error ? { error } : {}),
    event,
    level,
    ...(message ? { message } : {}),
    scope,
  }
}

const parseError = (value: unknown): RendererDiagnosticError | undefined => {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') throwInvalidReport()
  const input = value as Record<string, unknown>
  const message = optionalBoundedString(input.message, 500)
  if (!message) throwInvalidReport()
  const name = optionalBoundedString(input.name, 100)
  const stack = optionalBoundedString(input.stack, 4_000)
  return { message: message as string, ...(name ? { name } : {}), ...(stack ? { stack } : {}) }
}

const optionalBoundedString = (value: unknown, maxLength: number): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throwInvalidReport()
  }
  return value as string
}

const parseIdentifier = (value: unknown): string => {
  if (typeof value !== 'string' || !identifierPattern.test(value)) throwInvalidReport()
  return value as string
}

const parseLevel = (value: unknown): RendererDiagnosticLevel => {
  if (typeof value !== 'string' || !levels.has(value as RendererDiagnosticLevel)) {
    throwInvalidReport()
  }
  return value as RendererDiagnosticLevel
}

const throwInvalidReport = (): never => {
  throw new Error('Invalid renderer diagnostic report')
}
