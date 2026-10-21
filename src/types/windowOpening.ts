import type { DesktopCommandResults, DesktopEventPayloads } from '@/generated/desktop/bindings'

export const windowOpeningStages = [
  'starting',
  'loading',
  'indexing',
  'failed',
] as const satisfies readonly WindowOpeningStage[]
export type WindowOpeningProgress = DesktopEventPayloads['window-opening-progress']
export type WindowOpeningStage = WindowOpeningProgress['stage']
export type WindowOpeningRetryResult = DesktopCommandResults['retry_window_open']
