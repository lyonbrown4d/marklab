export type RendererDiagnosticLevel = 'debug' | 'error' | 'info' | 'warn'

export type RendererDiagnosticError = {
  message: string
  name?: string
  stack?: string
}

export type RendererDiagnosticReport = {
  error?: RendererDiagnosticError
  event: string
  level: RendererDiagnosticLevel
  message?: string
  scope: string
}

export type RendererDiagnosticResult = {
  ok: boolean
  reason?: 'rate-limited'
}
