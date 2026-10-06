export type LifecyclePhase = 'infrastructure' | 'services' | 'runtime'

export type LifecycleTask = {
  readonly critical: boolean
  readonly dependencies: readonly string[]
  readonly name: string
  readonly order: number
  readonly phase: LifecyclePhase
  readonly start: () => Promise<void> | void
  readonly stop?: () => Promise<void> | void
}
