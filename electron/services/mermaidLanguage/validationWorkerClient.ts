import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type WorkerOptions, Worker } from 'node:worker_threads'

import type {
  MermaidTextDocument,
  MermaidValidationIssue,
  MermaidValidationOptions,
} from '@electron/services/mermaidLanguage/types'
import type {
  MermaidValidationError,
  MermaidValidationWorkerRequest,
  MermaidValidationWorkerResponse,
} from '@electron/services/mermaidLanguage/validationWorkerMessages'

export type MermaidValidationWorker = {
  on(event: 'message', listener: (message: MermaidValidationWorkerResponse) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  postMessage(message: MermaidValidationWorkerRequest): void
  terminate(): Promise<number>
  unref(): unknown
}

export type MermaidValidationWorkerFactory = () => MermaidValidationWorker

type PendingValidation = {
  document: Pick<MermaidTextDocument, 'uri' | 'version'>
  onAbort?: () => void
  reject: (error: Error) => void
  resolve: (issues: readonly MermaidValidationIssue[]) => void
  signal?: AbortSignal
}

const workerEntryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'mermaidValidationWorkerEntry.js',
)

const defaultWorkerFactory: MermaidValidationWorkerFactory = () =>
  new Worker(workerEntryPath, { type: 'module' } as WorkerOptions)

export class MermaidValidationWorkerClient {
  private worker: MermaidValidationWorker | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingValidation>()
  private readonly activeByUri = new Map<string, { id: number; version: number }>()

  constructor(private readonly createWorker = defaultWorkerFactory) {}

  validate(
    document: MermaidTextDocument,
    options: MermaidValidationOptions,
  ): Promise<readonly MermaidValidationIssue[]> {
    if (options.signal?.aborted) return Promise.reject(abortError())
    const active = this.activeByUri.get(document.uri)
    if (active && document.version < active.version) return Promise.reject(abortError())
    if (active) this.cancel(active.id)

    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1
    this.activeByUri.set(document.uri, { id, version: document.version })

    return new Promise((resolve, reject) => {
      const pending: PendingValidation = {
        document: { uri: document.uri, version: document.version },
        reject,
        resolve,
        signal: options.signal,
      }
      if (options.signal) {
        pending.onAbort = () => this.cancel(id)
        options.signal.addEventListener('abort', pending.onAbort, { once: true })
      }
      this.pending.set(id, pending)
      try {
        worker.postMessage({ id, type: 'validate', document })
      } catch (error) {
        this.takePending(id)?.reject(asError(error))
      }
    })
  }

  terminate(): void {
    const worker = this.worker
    this.worker = null
    this.rejectPending(new Error('Mermaid validation worker terminated.'))
    void worker?.terminate()
  }

  private ensureWorker(): MermaidValidationWorker {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.on('message', (message) => this.handleMessage(message))
    worker.on('error', (error) => this.handleWorkerFailure(worker, error))
    worker.on('exit', (code) => {
      if (this.worker !== worker) return
      this.worker = null
      if (this.pending.size > 0) {
        this.rejectPending(
          new Error(`Mermaid validation worker exited before responding (${code}).`),
        )
      }
    })
    worker.unref()
    this.worker = worker
    return worker
  }

  private cancel(id: number): void {
    const pending = this.takePending(id)
    if (!pending) return
    try {
      this.worker?.postMessage({ id, type: 'cancel' })
    } catch {
      // The caller is already being cancelled; a closed worker channel needs no further cleanup.
    }
    pending.reject(abortError())
  }

  private handleMessage(message: MermaidValidationWorkerResponse): void {
    const pending = this.takePending(message.id)
    if (!pending) return
    if (message.ok) {
      pending.resolve(message.issues)
      return
    }
    pending.reject(parserError(message.error))
  }

  private handleWorkerFailure(worker: MermaidValidationWorker, error: Error): void {
    if (this.worker !== worker) return
    this.worker = null
    this.rejectPending(error)
  }

  private takePending(id: number): PendingValidation | null {
    const pending = this.pending.get(id)
    if (!pending) return null
    this.pending.delete(id)
    if (pending.onAbort) pending.signal?.removeEventListener('abort', pending.onAbort)
    if (this.activeByUri.get(pending.document.uri)?.id === id) {
      this.activeByUri.delete(pending.document.uri)
    }
    return pending
  }

  private rejectPending(error: Error): void {
    const ids = [...this.pending.keys()]
    for (const id of ids) this.takePending(id)?.reject(error)
  }
}

const parserError = (value: MermaidValidationError): Error => {
  const error = new Error(value.message) as Error & {
    hash?: { loc: Record<string, number> }
  }
  if (value.location) {
    error.hash = {
      loc: {
        first_column: value.location.firstColumn,
        first_line: value.location.firstLine,
        last_column: value.location.lastColumn,
        last_line: value.location.lastLine,
      },
    }
  }
  return error
}

const abortError = (): Error => {
  const error = new Error('Mermaid validation was cancelled')
  error.name = 'AbortError'
  return error
}

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('Mermaid validation worker request failed.')
