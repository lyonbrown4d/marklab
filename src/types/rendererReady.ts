import type { DesktopCommandArgs } from '@/generated/desktop/bindings'

export const rendererReadyPhases = [
  'shell',
  'workspace-interactive',
  'workspace-error',
] as const satisfies readonly RendererReadyPhase[]
export type RendererReadySignal = DesktopCommandArgs['app_ready']['request']
export type RendererReadyPhase = RendererReadySignal['phase']
