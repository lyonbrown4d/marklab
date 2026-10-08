export const rendererReadyPhases = ['shell', 'workspace-interactive', 'workspace-error'] as const

export type RendererReadyPhase = (typeof rendererReadyPhases)[number]

export type RendererReadySignal = {
  error?: string
  phase: RendererReadyPhase
}
