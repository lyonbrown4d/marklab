import { performance } from 'node:perf_hooks'

export type WindowOpenTimings = {
  acquisitionMs: number
  rendererActivationMs: number
  rendererInteractiveMs: number
  sessionSeedMs: number
  totalMs: number
  workspaceInitializationMs: number
}

type WindowOpenPhase =
  'rendererActivationMs' | 'rendererInteractiveMs' | 'sessionSeedMs' | 'workspaceInitializationMs'

export const createWindowOpenTimings = (
  acquisitionMs: number,
  now = performance.now.bind(performance),
) => {
  const startedAt = now()
  let phaseStartedAt = startedAt
  const phases: Partial<Record<WindowOpenPhase, number>> = {}

  return {
    finishPhase: (phase: WindowOpenPhase): void => {
      const finishedAt = now()
      phases[phase] = Math.max(0, finishedAt - phaseStartedAt)
      phaseStartedAt = finishedAt
    },
    snapshot: (): WindowOpenTimings => ({
      acquisitionMs,
      rendererActivationMs: phases.rendererActivationMs ?? 0,
      rendererInteractiveMs: phases.rendererInteractiveMs ?? 0,
      sessionSeedMs: phases.sessionSeedMs ?? 0,
      totalMs: Math.max(0, acquisitionMs + now() - startedAt),
      workspaceInitializationMs: phases.workspaceInitializationMs ?? 0,
    }),
  }
}
