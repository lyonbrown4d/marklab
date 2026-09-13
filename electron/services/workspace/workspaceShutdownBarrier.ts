import { AsyncLocalStorage } from 'node:async_hooks'

type WorkspaceMutationContext = {
  active: boolean
  gate: WorkspaceMutationGate
}

const workspaceMutationContext = new AsyncLocalStorage<WorkspaceMutationContext>()
export class WorkspaceMutationRejectedError extends Error {
  readonly code = 'workspace_mutation_frozen' as const

  constructor(
    readonly operation: string,
    readonly reason: string,
  ) {
    super('Cannot ' + operation + ' while workspace mutations are frozen for ' + reason)
    this.name = 'WorkspaceMutationRejectedError'
  }
}

export class WorkspaceMutationGate {
  private activeCount = 0
  private drainWaiters = new Set<() => void>()
  private frozenReason: string | null = null

  get reason(): string | null {
    return this.frozenReason
  }

  runSync<T>(operation: string, work: () => T): T {
    const parent = workspaceMutationContext.getStore()
    if (parent?.gate === this && parent.active) this.activeCount += 1
    else this.enter(operation)
    const context: WorkspaceMutationContext = { active: true, gate: this }
    try {
      return workspaceMutationContext.run(context, work)
    } finally {
      context.active = false
      this.leave()
    }
  }

  async runAsync<T>(operation: string, work: () => Promise<T>): Promise<T> {
    const parent = workspaceMutationContext.getStore()
    if (parent?.gate === this && parent.active) this.activeCount += 1
    else this.enter(operation)
    const context: WorkspaceMutationContext = { active: true, gate: this }
    try {
      return await workspaceMutationContext.run(context, work)
    } finally {
      context.active = false
      this.leave()
    }
  }

  freezeAndDrain(reason: string): Promise<void> {
    if (this.frozenReason) {
      return Promise.reject(new Error('Workspace mutation gate is already frozen'))
    }
    this.frozenReason = reason
    if (this.activeCount === 0) return Promise.resolve()
    return new Promise((resolve) => this.drainWaiters.add(resolve))
  }

  unfreeze(): void {
    this.frozenReason = null
  }

  private enter(operation: string): void {
    if (this.frozenReason) {
      throw new WorkspaceMutationRejectedError(operation, this.frozenReason)
    }
    this.activeCount += 1
  }

  private leave(): void {
    this.activeCount -= 1
    if (this.activeCount !== 0) return
    const waiters = [...this.drainWaiters]
    this.drainWaiters.clear()
    for (const resolve of waiters) resolve()
  }
}

export type WorkspaceShutdownParticipant = {
  currentEpoch: () => number
  gate: WorkspaceMutationGate
  hasDirtyBuffers: () => boolean
  id: number
}

type ActiveBarrier = {
  epochs: Map<number, number>
  id: number
  participants: WorkspaceShutdownParticipant[]
  reason: string
}

export class WorkspaceShutdownBarrier {
  private active: ActiveBarrier | null = null
  private nextId = 0

  get reason(): string | null {
    return this.active?.reason ?? null
  }

  async begin(reason: string, participants: WorkspaceShutdownParticipant[]): Promise<number> {
    if (this.active) throw new Error('Workspace shutdown barrier is already active')
    const barrier: ActiveBarrier = {
      epochs: new Map(),
      id: ++this.nextId,
      participants: [...participants],
      reason,
    }
    this.active = barrier
    try {
      const drains = barrier.participants.map((participant) =>
        participant.gate.freezeAndDrain(reason),
      )
      await Promise.all(drains)
      for (const participant of barrier.participants) {
        barrier.epochs.set(participant.id, participant.currentEpoch())
      }
      return barrier.id
    } catch (error) {
      if (this.active === barrier) this.active = null
      for (const participant of barrier.participants) participant.gate.unfreeze()
      throw error
    }
  }

  complete(id: number): void {
    const barrier = this.requireActive(id)
    this.active = null
    for (const participant of barrier.participants) participant.gate.unfreeze()
  }
  cancel(id: number): void {
    const barrier = this.requireActive(id)
    this.active = null
    for (const participant of barrier.participants) participant.gate.unfreeze()
  }

  review(id: number, participants: WorkspaceShutdownParticipant[]): void {
    const barrier = this.requireActive(id)
    const currentById = new Map(participants.map((participant) => [participant.id, participant]))
    const errors: Error[] = []
    if (currentById.size !== barrier.participants.length) {
      errors.push(new Error('Workspace bindings changed during shutdown'))
    }
    for (const expected of barrier.participants) {
      const current = currentById.get(expected.id)
      if (!current) {
        errors.push(new Error('Workspace binding ' + expected.id + ' disappeared during shutdown'))
        continue
      }
      if (current.currentEpoch() !== barrier.epochs.get(expected.id)) {
        errors.push(new Error('Workspace binding ' + expected.id + ' changed during shutdown'))
      }
      if (current.hasDirtyBuffers()) {
        errors.push(new Error('Workspace binding ' + expected.id + ' still has unsaved buffers'))
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Workspace shutdown stability review failed')
    }
  }

  private requireActive(id: number): ActiveBarrier {
    if (!this.active || this.active.id !== id) {
      throw new Error('Workspace shutdown barrier is not active')
    }
    return this.active
  }
}
