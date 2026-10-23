import { releaseProxy, wrap, type Endpoint, type Remote } from 'comlink'

export type RpcWorker = Endpoint & {
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  terminate: () => void
}

type PendingCall = { reject: (error: Error) => void }
type WorkerSession<T> = { dispose: () => void; remote: Remote<T> }

const createAbortError = () => new DOMException('Aborted', 'AbortError')

// Comlink dispatches calls; this boundary owns the lifetime of CPU-bound workers.
export class WorkerRpcClient<T> {
  private readonly pending = new Set<PendingCall>()
  private session: WorkerSession<T> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private readonly createWorker: () => RpcWorker
  private readonly label: string

  constructor(createWorker: () => RpcWorker, label: string) {
    this.createWorker = createWorker
    this.label = label
  }

  call = <R>(
    invoke: (remote: Remote<T>) => Promise<R>,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<R> => {
    if (signal?.aborted) return Promise.reject(createAbortError())
    return new Promise<R>((resolve, reject) => {
      const session = this.ensureSession()
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        this.pending.delete(pending)
        signal?.removeEventListener('abort', onAbort)
        clearTimeout(timer)
        this.scheduleIdleRelease()
      }
      const pending: PendingCall = {
        reject: (error) => {
          cleanup()
          reject(error)
        },
      }
      const cancel = (error: Error) => {
        if (!this.pending.has(pending)) return
        pending.reject(error)
        this.stop(new DOMException(`${this.label} restarted after cancellation.`, 'AbortError'))
      }
      const onAbort = () => cancel(createAbortError())
      this.pending.add(pending)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => cancel(new Error('scanTimedOut')), timeoutMs)
      }
      try {
        void invoke(session.remote).then(
          (result) => {
            if (!this.pending.has(pending)) return
            cleanup()
            resolve(result)
          },
          (error: unknown) => {
            if (!this.pending.has(pending)) return
            pending.reject(
              error instanceof Error ? error : new Error(`${this.label} request failed.`),
            )
          },
        )
      } catch (error) {
        pending.reject(error instanceof Error ? error : new Error(`${this.label} request failed.`))
      }
    })
  }

  terminate = (): void => this.stop(new Error(`${this.label} terminated.`))

  private ensureSession = (): WorkerSession<T> => {
    clearTimeout(this.idleTimer)
    if (this.session) return this.session
    const worker = this.createWorker()
    let target: RpcWorker | null = worker
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
    const endpoint: Endpoint = {
      postMessage: (message: unknown, transfer?: Transferable[]) => {
        try {
          target?.postMessage(message, transfer)
        } catch (error) {
          this.stop(error instanceof Error ? error : new Error(`${this.label} request failed.`))
          throw error
        }
      },
      addEventListener: (type, listener) => {
        if (!target) return
        const registered = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>()
        registered.add(listener)
        listeners.set(type, registered)
        target.addEventListener(type, listener)
      },
      removeEventListener: (type, listener) => {
        listeners.get(type)?.delete(listener)
        target?.removeEventListener(type, listener)
      },
    }
    const remote = wrap<T>(endpoint)
    const dispose = () => {
      for (const [type, registered] of listeners) {
        for (const listener of registered) worker.removeEventListener(type, listener)
      }
      listeners.clear()
      // The worker is about to terminate and cannot acknowledge RELEASE. Detach
      // first, then clear Comlink's pending callbacks without sending another call.
      target = null
      remote[releaseProxy]()
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
    }
    const session = { dispose, remote }
    const fail = (message: string) => {
      if (this.session === session) this.stop(new Error(message))
    }
    worker.onerror = (event) => fail(event.message || `${this.label} failed.`)
    worker.onmessageerror = () => fail(`${this.label} response could not be decoded.`)
    this.session = session
    return session
  }

  private stop = (error: Error): void => {
    clearTimeout(this.idleTimer)
    this.idleTimer = undefined
    const session = this.session
    this.session = null
    for (const pending of this.pending) pending.reject(error)
    session?.dispose()
  }

  private scheduleIdleRelease = (): void => {
    if (this.pending.size > 0 || !this.session) return
    clearTimeout(this.idleTimer)
    // These RPC workers are stateless. Release their heaps after a quiet period;
    // the next request recreates the transport without touching editor state.
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) this.stop(new Error(`${this.label} idle.`))
    }, 30_000)
  }
}
