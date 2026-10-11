import PlateDocumentFindWorker from '@/workers/plateDocumentFindWorker?worker'
import type {
  PlateDocumentFindWorkerMatch,
  PlateDocumentFindWorkerResponse,
  PlateDocumentFindWorkerScan,
} from '@/workers/plateDocumentFindWorkerProtocol'

export type PlateDocumentFindWorkerPort = Pick<
  Worker,
  'onerror' | 'onmessage' | 'postMessage' | 'terminate'
>

type PendingScan = {
  reject: (error: Error) => void
  resolve: (matches: PlateDocumentFindWorkerMatch[]) => void
  removeAbortListener?: () => void
  timer?: ReturnType<typeof setTimeout>
}

const createAbortError = () => new DOMException('Aborted', 'AbortError')

export class PlateDocumentFindWorkerClient {
  private readonly createWorker: () => PlateDocumentFindWorkerPort
  private nextId = 1
  private readonly pending = new Map<number, PendingScan>()
  private readonly timeoutMs: number
  private worker: PlateDocumentFindWorkerPort | null = null

  constructor(
    createWorker: () => PlateDocumentFindWorkerPort = () => new PlateDocumentFindWorker(),
    timeoutMs = 2_000,
  ) {
    this.createWorker = createWorker
    this.timeoutMs = timeoutMs
  }

  scan(
    request: PlateDocumentFindWorkerScan,
    signal?: AbortSignal,
  ): Promise<PlateDocumentFindWorkerMatch[]> {
    if (signal?.aborted) return Promise.reject(createAbortError())
    let worker: PlateDocumentFindWorkerPort
    try {
      worker = this.ensureWorker()
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Document find worker is unavailable.'),
      )
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const onAbort = () => this.abort(id)
      const pending: PendingScan = { reject, resolve }
      if (signal) {
        pending.removeAbortListener = () => signal.removeEventListener('abort', onAbort)
        signal.addEventListener('abort', onAbort, { once: true })
      }
      pending.timer = setTimeout(() => this.abort(id, new Error('scanTimedOut')), this.timeoutMs)
      this.pending.set(id, pending)
      try {
        worker.postMessage({ ...request, id })
      } catch (error) {
        this.pending.delete(id)
        pending.removeAbortListener?.()
        clearTimeout(pending.timer)
        reject(error instanceof Error ? error : new Error('Document find request failed.'))
      }
    })
  }

  terminate() {
    const worker = this.worker
    this.worker = null
    this.rejectPending(new Error('Document find worker terminated.'))
    worker?.terminate()
  }

  private abort(id: number, error: Error = createAbortError()) {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    pending.removeAbortListener?.()
    if (pending.timer) clearTimeout(pending.timer)
    pending.reject(error)
    const worker = this.worker
    this.worker = null
    this.rejectPending(new Error('Document find worker restarted after cancellation.'))
    worker?.terminate()
  }

  private ensureWorker() {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.onmessage = ({ data }) => this.handleMessage(data as PlateDocumentFindWorkerResponse)
    worker.onerror = (event) => {
      if (this.worker !== worker) return
      this.worker = null
      this.rejectPending(new Error(event.message || 'Document find worker failed.'))
    }
    this.worker = worker
    return worker
  }

  private handleMessage(message: PlateDocumentFindWorkerResponse) {
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    pending.removeAbortListener?.()
    if (pending.timer) clearTimeout(pending.timer)
    if (message.ok) pending.resolve(message.matches)
    else pending.reject(new Error(message.error))
  }

  private rejectPending(error: Error) {
    const pending = [...this.pending.values()]
    this.pending.clear()
    pending.forEach((scan) => {
      scan.removeAbortListener?.()
      if (scan.timer) clearTimeout(scan.timer)
      scan.reject(error)
    })
  }
}
