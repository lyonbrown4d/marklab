import type { ElectronToken } from '@electron/di/tokens'

type Dispose = () => Promise<void> | void

export class OwnedResourceRegistry {
  private readonly disposers = new Map<ElectronToken<unknown>, Dispose>()

  track<T>(
    token: ElectronToken<T>,
    resource: T,
    dispose: (resource: T) => Promise<void> | void,
  ): T {
    this.disposers.set(token as ElectronToken<unknown>, () => dispose(resource))
    return resource
  }

  async disposeAll(): Promise<unknown[]> {
    const failures: unknown[] = []
    for (const [token, dispose] of [...this.disposers].reverse()) {
      try {
        await dispose()
        this.disposers.delete(token)
      } catch (error) {
        failures.push(error)
      }
    }
    return failures
  }
}
