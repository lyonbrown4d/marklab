import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'

export type RendererDiagnosticReport = DesktopCommandArgs['diagnostics_renderer_report']['request']
export type RendererDiagnosticLevel = RendererDiagnosticReport['level']
export type RendererDiagnosticError = NonNullable<RendererDiagnosticReport['error']>
export type RendererDiagnosticResult = DesktopCommandResults['diagnostics_renderer_report']
