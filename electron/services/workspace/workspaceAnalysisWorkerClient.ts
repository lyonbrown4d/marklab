import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Logger } from '@electron/services/logger.js'
import type {
  WorkspaceAnalysisResult,
  WorkspaceAnalysisTask,
  WorkspaceAnalysisWorkerRequest,
  WorkspaceAnalysisWorkerResponse,
} from '@electron/services/workspace/workspaceAnalysisWorkerMessages.js'

type PendingTask = {
  reject: (error: Error) => void
  resolve: (value: WorkspaceAnalysisResult) => void
}

type RawWorkerMessage = WorkspaceAnalysisWorkerResponse

const workerEntryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'workspaceAnalysisWorkerEntry.js',
)

export class WorkspaceAnalysisWorkerClient {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingTask>()

  constructor(private readonly logger: Logger) {}

  run<T extends WorkspaceAnalysisResult>(task: WorkspaceAnalysisTask): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      const request: WorkspaceAnalysisWorkerRequest = { id, task }
      worker.postMessage(request)
    })
  }

  terminate(): void {
    const worker = this.worker
    this.worker = null
    this.rejectPending(new Error('Workspace analysis worker terminated.'))
    void worker?.terminate()
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(workerEntryPath, { type: 'module' })
    worker.on('message', (message) => this.handleMessage(message as RawWorkerMessage))
    worker.on('error', (error) => {
      this.logger.warn('workspace analysis worker failed', { error })
      this.worker = null
      this.rejectPending(
        error instanceof Error ? error : new Error('Workspace analysis worker failed.'),
      )
    })
    worker.on('exit', (code) => {
      if (this.worker === worker) this.worker = null
      if (code !== 0) {
        this.rejectPending(new Error(`Workspace analysis worker exited with code ${code}.`))
      }
    })

    this.worker = worker
    return worker
  }

  private handleMessage(message: RawWorkerMessage): void {
    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    if (message.ok) {
      pending.resolve(message.payload)
      return
    }

    pending.reject(new Error(message.error))
  }

  private rejectPending(error: Error): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const task of pending) task.reject(error)
  }
}
