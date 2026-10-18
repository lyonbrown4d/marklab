import Elk from 'elkjs/lib/elk-api'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import type {
  GraphLayoutEngineResult,
  GraphLayoutNodeResult,
  GraphLayoutPosition,
  GraphLayoutWorkerGraph,
} from '@/logic/graphLayoutWorkerMessages'

type PendingLayout = {
  engine: GraphLayoutEngineLike
  removeAbortListener: () => void
  reject: (error: unknown) => void
  resolve: (positions: GraphLayoutPosition[]) => void
}

export type GraphLayoutEngineLike = {
  layout(graph: GraphLayoutWorkerGraph): Promise<GraphLayoutEngineResult>
  terminateWorker(): void
}

type FatalWorkerErrorHandler = (error: Error) => void

const collectPositions = (
  nodes: GraphLayoutNodeResult[],
  parentX = 0,
  parentY = 0,
): GraphLayoutPosition[] =>
  nodes.flatMap((node) => {
    const x = parentX + (node.x ?? 0)
    const y = parentY + (node.y ?? 0)
    const ownPosition = node.x == null || node.y == null ? [] : [{ id: node.id, x, y }]
    return [...ownPosition, ...collectPositions(node.children ?? [], x, y)]
  })

const WORKER_IDLE_TIMEOUT_MS = 30_000

const createAbortError = () => new DOMException('Graph layout was cancelled.', 'AbortError')

export class GraphLayoutWorkerClient {
  private readonly createEngine: (onFatalError: FatalWorkerErrorHandler) => GraphLayoutEngineLike
  private engine: GraphLayoutEngineLike | null = null
  private readonly pending = new Set<PendingLayout>()
  private idleTimer: ReturnType<typeof setTimeout> | undefined

  constructor(createEngine: (onFatalError: FatalWorkerErrorHandler) => GraphLayoutEngineLike) {
    this.createEngine = createEngine
  }

  warmup(): void {
    this.ensureEngine()
    this.scheduleIdleTermination()
  }

  layout(graph: GraphLayoutWorkerGraph, signal?: AbortSignal): Promise<GraphLayoutPosition[]> {
    if (signal?.aborted) return Promise.reject(createAbortError())

    const engine = this.ensureEngine()

    return new Promise((resolve, reject) => {
      const handleAbort = () => {
        if (!this.pending.delete(task)) return
        task.removeAbortListener()
        reject(createAbortError())
        if (this.engine !== engine) return
        // ELK cannot interrupt an in-flight layout within a worker. Restarting that shared
        // worker cancels the CPU work; sibling requests are rejected so none remain stranded.
        this.clearIdleTimer()
        this.engine = null
        engine.terminateWorker()
        this.rejectPendingForEngine(
          engine,
          new Error('Graph layout worker restarted after cancellation.'),
        )
      }
      const task: PendingLayout = {
        engine,
        reject,
        resolve,
        removeAbortListener: () => signal?.removeEventListener('abort', handleAbort),
      }
      signal?.addEventListener('abort', handleAbort, { once: true })
      this.pending.add(task)
      try {
        void engine.layout(graph).then(
          (result) => this.resolveTask(task, result),
          (error: unknown) => this.rejectTask(task, error),
        )
      } catch (error) {
        this.rejectTask(task, error)
      }
    })
  }

  terminate(): void {
    this.clearIdleTimer()
    const engine = this.engine
    this.engine = null
    this.rejectPending(new Error('Graph layout worker terminated.'))
    engine?.terminateWorker()
  }

  private ensureEngine(): GraphLayoutEngineLike {
    this.clearIdleTimer()
    if (this.engine) return this.engine
    let createdEngine: GraphLayoutEngineLike | null = null
    let earlyError: Error | null = null
    createdEngine = this.createEngine((error) => {
      if (!createdEngine) {
        earlyError = error
        return
      }
      this.failEngine(createdEngine, error)
    })
    this.engine = createdEngine
    const startupError = earlyError as Error | null
    if (startupError) queueMicrotask(() => this.failEngine(createdEngine, startupError))
    return createdEngine
  }

  private failEngine(engine: GraphLayoutEngineLike, error: Error): void {
    if (this.engine !== engine) return
    this.clearIdleTimer()
    this.engine = null
    engine.terminateWorker()
    this.rejectPendingForEngine(engine, error)
  }

  private resolveTask(task: PendingLayout, result: GraphLayoutEngineResult): void {
    if (!this.pending.delete(task)) return
    task.removeAbortListener()
    task.resolve(collectPositions(result.children ?? []))
    this.scheduleIdleTermination()
  }

  private rejectTask(task: PendingLayout, error: unknown): void {
    if (!this.pending.delete(task)) return
    task.removeAbortListener()
    task.reject(error)
    this.scheduleIdleTermination()
  }

  private clearIdleTimer(): void {
    clearTimeout(this.idleTimer)
    this.idleTimer = undefined
  }

  private scheduleIdleTermination(): void {
    this.clearIdleTimer()
    if (!this.engine || this.pending.size > 0) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined
      if (this.pending.size === 0) this.terminate()
    }, WORKER_IDLE_TIMEOUT_MS)
  }

  private rejectPending(error: Error): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    pending.forEach((task) => {
      task.removeAbortListener()
      task.reject(error)
    })
  }

  private rejectPendingForEngine(engine: GraphLayoutEngineLike, error: Error): void {
    const affected = [...this.pending].filter((task) => task.engine === engine)
    affected.forEach((task) => {
      this.pending.delete(task)
      task.removeAbortListener()
      task.reject(error)
    })
  }
}

const createGraphLayoutEngine = (onFatalError: FatalWorkerErrorHandler): GraphLayoutEngineLike => {
  let worker: Worker | null = null
  const handleError = (event: ErrorEvent) => {
    onFatalError(event.error instanceof Error ? event.error : new Error(event.message))
  }
  const handleMessageError = () => {
    onFatalError(new Error('Graph layout worker returned an unreadable message.'))
  }
  const elk = new Elk({
    workerFactory: () => {
      worker = new Worker(elkWorkerUrl)
      worker.addEventListener('error', handleError)
      worker.addEventListener('messageerror', handleMessageError)
      return worker
    },
  })
  return {
    layout: (graph) => elk.layout(graph),
    terminateWorker: () => {
      worker?.removeEventListener('error', handleError)
      worker?.removeEventListener('messageerror', handleMessageError)
      elk.terminateWorker()
      worker = null
    },
  }
}

export const graphLayoutWorkerClient = new GraphLayoutWorkerClient(createGraphLayoutEngine)
