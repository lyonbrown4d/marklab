import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'
import type {
  RendererDiagnosticError,
  RendererDiagnosticLevel,
  RendererDiagnosticReport,
} from '@/types/rendererDiagnostics'

type DiagnosticInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>
type ReporterOptions = { invoke: DiagnosticInvoke; now?: () => number }

export type RendererDiagnosticReporter = {
  error: (scope: string, event: string, error?: unknown, message?: string) => void
  info: (scope: string, event: string, message?: string) => void
  warn: (scope: string, event: string, error?: unknown, message?: string) => void
}

export const normalizeDiagnosticError = (value: unknown): RendererDiagnosticError => {
  try {
    if (!(value instanceof Error)) {
      return { message: safeBoundedString(value, 'Unknown error', 500) }
    }
    return {
      message: safeErrorProperty(value, 'message', 'Unknown error', 500),
      name: safeErrorProperty(value, 'name', 'Error', 100),
      ...safeStack(value),
    }
  } catch {
    return { message: 'Unknown error' }
  }
}

export const createRendererDiagnosticReporter = ({
  invoke,
  now = Date.now,
}: ReporterOptions): RendererDiagnosticReporter => {
  const recent = new Map<string, number>()
  const send = (report: RendererDiagnosticReport): void => {
    const fingerprint = [
      report.level,
      report.scope,
      report.event,
      report.message,
      report.error?.name,
      report.error?.message,
    ].join('|')
    const timestamp = now()
    const previous = recent.get(fingerprint)
    if (previous !== undefined && timestamp - previous < 5_000) return
    recent.set(fingerprint, timestamp)
    if (recent.size > 100) recent.delete(recent.keys().next().value ?? fingerprint)
    void Promise.resolve()
      .then(() =>
        invoke('diagnostics_renderer_report', report as unknown as Record<string, unknown>),
      )
      .catch(() => undefined)
  }
  return {
    error: (scope, event, error, message) => safeSend(send, 'error', scope, event, error, message),
    info: (scope, event, message) => safeSend(send, 'info', scope, event, undefined, message),
    warn: (scope, event, error, message) => safeSend(send, 'warn', scope, event, error, message),
  }
}

const createReport = (
  level: RendererDiagnosticLevel,
  scope: string,
  event: string,
  error?: unknown,
  message?: string,
): RendererDiagnosticReport => ({
  ...(error !== undefined ? { error: normalizeDiagnosticError(error) } : {}),
  event,
  level,
  ...(message ? { message: safeBoundedString(message, '', 500) } : {}),
  scope,
})

const safeSend = (
  send: (report: RendererDiagnosticReport) => void,
  level: RendererDiagnosticLevel,
  scope: string,
  event: string,
  error?: unknown,
  message?: string,
): void => {
  try {
    send(createReport(level, scope, event, error, message))
  } catch {
    // Diagnostics must never affect the interaction that produced them.
  }
}

const safeBoundedString = (value: unknown, fallback: string, maxLength: number): string => {
  try {
    return (typeof value === 'string' ? value : fallback).slice(0, maxLength)
  } catch {
    return fallback
  }
}

const safeErrorProperty = (
  error: Error,
  key: 'message' | 'name',
  fallback: string,
  maxLength: number,
): string => {
  try {
    return safeBoundedString(error[key], fallback, maxLength) || fallback
  } catch {
    return fallback
  }
}

const safeStack = (error: Error): { stack?: string } => {
  try {
    return typeof error.stack === 'string' ? { stack: error.stack.slice(0, 4_000) } : {}
  } catch {
    return {}
  }
}

let desktopReporter: RendererDiagnosticReporter | null = null

const getDesktopReporter = (): RendererDiagnosticReporter | null => {
  if (!isElectronRuntime()) return null
  desktopReporter ??= createRendererDiagnosticReporter({
    invoke: (command, args) => getElectronRuntime().commands.invoke(command, args),
  })
  return desktopReporter
}

export const rendererDiagnostics: RendererDiagnosticReporter = {
  error: (scope, event, error, message) =>
    getDesktopReporter()?.error(scope, event, error, message),
  info: (scope, event, message) => getDesktopReporter()?.info(scope, event, message),
  warn: (scope, event, error, message) => getDesktopReporter()?.warn(scope, event, error, message),
}

export const installRendererDiagnostics = (
  reporter: RendererDiagnosticReporter | null = getDesktopReporter(),
): (() => void) => {
  if (!reporter) return () => undefined
  reporter.info('app.lifecycle', 'renderer-started')
  const onError = (event: ErrorEvent) =>
    reporter.error('app.runtime', 'unhandled-error', event.error ?? event.message)
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    reporter.error('app.runtime', 'unhandled-rejection', event.reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}

export const reportReactError = (
  event: 'caught-error' | 'recoverable-error' | 'uncaught-error',
  error: unknown,
  componentStack?: string,
): void => {
  getDesktopReporter()?.error('react.runtime', event, error, componentStack)
}
