import path from 'node:path'

type RunOptions = { signal?: AbortSignal }
type ActiveSync = { controller: AbortController; promise: Promise<unknown> }

export class WorkspaceSyncBusyError extends Error {
  readonly code = 'workspace_sync_busy' as const

  constructor() {
    super('A workspace sync is already running')
    this.name = 'WorkspaceSyncBusyError'
  }
}

export class WorkspaceSyncCoordinator {
  private readonly activeSyncs = new Map<string, ActiveSync>()
  private configurationTail: Promise<void> = Promise.resolve()
  private readonly mutationTails = new Map<string, Promise<void>>()

  runSync<T>(
    root: string,
    work: (signal: AbortSignal) => Promise<T>,
    options: RunOptions = {},
  ): Promise<T> {
    const key = canonicalRoot(root)
    const active = this.activeSyncs.get(key)
    if (options.signal?.aborted) return Promise.reject(abortError())
    if (active) return Promise.reject(new WorkspaceSyncBusyError())
    const controller = new AbortController()
    const run = this.runMutation(root, () => {
      if (controller.signal.aborted) return Promise.reject(abortError())
      return work(controller.signal)
    })
    const tracked = { controller, promise: run }
    this.activeSyncs.set(key, tracked)
    void run
      .finally(() => {
        if (this.activeSyncs.get(key) === tracked) this.activeSyncs.delete(key)
      })
      .catch(() => undefined)
    return options.signal ? raceAbort(run, options.signal) : run
  }

  cancel(root: string): boolean {
    const active = this.activeSyncs.get(canonicalRoot(root))
    if (!active) return false
    active.controller.abort()
    return true
  }

  runConfigurationMutation<T>(work: () => Promise<T>): Promise<T> {
    const run = this.configurationTail.then(work, work)
    this.configurationTail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  runMutation<T>(root: string, work: () => Promise<T>): Promise<T> {
    const key = canonicalRoot(root)
    const previous = this.mutationTails.get(key) ?? Promise.resolve()
    const run = previous.then(work, work)
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    this.mutationTails.set(key, tail)
    void tail.finally(() => {
      if (this.mutationTails.get(key) === tail) this.mutationTails.delete(key)
    })
    return run
  }
}

const canonicalRoot = (root: string): string => {
  const normalized = path.resolve(root).normalize('NFC').replaceAll('\\', '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

const abortError = (): Error =>
  Object.assign(new Error('Workspace sync was aborted'), { name: 'AbortError' })

const raceAbort = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError())
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
