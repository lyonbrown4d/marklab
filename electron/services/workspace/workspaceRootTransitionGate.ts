import type { WorkspaceRootSwitchOptions } from '@electron/services/workspace/types'

type ActiveRootTransition = {
  signal?: AbortSignal
  token: symbol
}

export class WorkspaceRootTransitionGate {
  private active: ActiveRootTransition | null = null

  get blocksMutations(): boolean {
    return Boolean(this.active && !this.active.signal?.aborted)
  }

  async run<T>(options: WorkspaceRootSwitchOptions, work: () => Promise<T>): Promise<T> {
    options.signal?.throwIfAborted()
    const token = this.begin(options)
    try {
      return await work()
    } finally {
      this.finish(token)
    }
  }

  private begin(options: WorkspaceRootSwitchOptions): symbol {
    if (this.blocksMutations) {
      throw new Error('Another workspace switch is already in progress')
    }
    const token = Symbol('workspace-root-transition')
    this.active = { signal: options.signal, token }
    return token
  }

  private finish(token: symbol): void {
    if (this.active?.token === token) this.active = null
  }
}
