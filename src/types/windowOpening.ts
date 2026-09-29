export const windowOpeningStages = ['starting', 'loading', 'indexing', 'failed'] as const

export type WindowOpeningStage = (typeof windowOpeningStages)[number]

export type WindowOpeningProgress = {
  error?: string
  stage: WindowOpeningStage
  workspacePath: string
}

export type WindowOpeningRetryResult = {
  error?: string
  ok: boolean
}
