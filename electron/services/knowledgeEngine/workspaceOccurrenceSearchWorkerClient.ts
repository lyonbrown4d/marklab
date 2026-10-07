import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type WorkerOptions, Worker } from 'node:worker_threads'

import PQueue from 'p-queue'

import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type {
  OccurrenceSearchInput,
  OccurrenceSearchOutput,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'
import type { WorkspaceOccurrenceSearchWorkerResponse } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerMessages'

const DEFAULT_TIMEOUT_MS = 2_000
const DEFAULT_MAX_QUEUED_JOBS = 32

type WorkerListener = (...args: unknown[]) => void
type WorkerLike = {
  off: (event: string, listener: WorkerListener) => unknown
  on: (event: string, listener: WorkerListener) => unknown
  postMessage: (value: unknown) => void
  terminate: () => Promise<number>
}

type WorkerClientOptions = {
  createWorker?: () => WorkerLike
  maxQueuedJobs?: number
  timeoutMs?: number
}

export type WorkspaceOccurrenceSearchDataset = {
  documents: WorkspaceSearchDocument[]
  revision: string
}

export class WorkspaceOccurrenceSearchWorkerClient {
  private readonly createWorker: () => WorkerLike
  private readonly maxQueuedJobs: number
  private readonly queue = new PQueue({ concurrency: 1 })
  private readonly timeoutMs: number
  private readonly jobControllers = new Set<AbortController>()
  private worker: WorkerLike | null = null
  private workerRevision = ''
  private nextMessageId = 1
  private disposed = false

  constructor(options: WorkerClientOptions = {}) {
    this.createWorker = options.createWorker ?? createOccurrenceSearchWorker
    this.maxQueuedJobs = options.maxQueuedJobs ?? DEFAULT_MAX_QUEUED_JOBS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  run(
    dataset: WorkspaceOccurrenceSearchDataset,
    input: OccurrenceSearchInput,
    signal?: AbortSignal,
  ): Promise<OccurrenceSearchOutput> {
    if (signal?.aborted) return Promise.reject(abortError())
    if (this.disposed) {
      return Promise.reject(new Error('Workspace occurrence search worker is disposed.'))
    }
    if (this.queue.size >= this.maxQueuedJobs) {
      return Promise.reject(new Error('Workspace occurrence search queue is full.'))
    }
    const controller = new AbortController()
    const removeAbortListener = linkAbortSignal(signal, controller)
    this.jobControllers.add(controller)
    return (
      this.queue.add(() => this.executeWithReset(dataset, input, controller.signal), {
        signal: controller.signal,
      }) as Promise<OccurrenceSearchOutput>
    )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) throw toError(error)
        throw this.disposed ? disposedError() : abortError()
      })
      .finally(() => {
        removeAbortListener()
        this.jobControllers.delete(controller)
      })
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const controller of this.jobControllers) controller.abort()
    await this.queue.onIdle()
    await this.resetWorker()
  }

  private async executeWithReset(
    dataset: WorkspaceOccurrenceSearchDataset,
    input: OccurrenceSearchInput,
    signal: AbortSignal,
  ): Promise<OccurrenceSearchOutput> {
    try {
      return await this.execute(dataset, input, signal)
    } catch (error) {
      void this.resetWorker()
      throw error
    }
  }

  private async execute(
    dataset: WorkspaceOccurrenceSearchDataset,
    input: OccurrenceSearchInput,
    signal: AbortSignal,
  ): Promise<OccurrenceSearchOutput> {
    signal.throwIfAborted()
    const worker = this.ensureWorker()
    if (this.workerRevision !== dataset.revision) {
      const syncId = this.nextMessageId++
      const synced = await this.request(
        worker,
        {
          type: 'sync',
          id: syncId,
          revision: dataset.revision,
          documents: dataset.documents,
        },
        signal,
      )
      if (synced.type !== 'synced' || synced.revision !== dataset.revision) {
        throw new Error('Occurrence search worker synchronized an unexpected revision.')
      }
      this.workerRevision = synced.revision
    }
    signal.throwIfAborted()
    const searchId = this.nextMessageId++
    const response = await this.request(
      worker,
      {
        type: 'search',
        id: searchId,
        revision: dataset.revision,
        input,
      },
      signal,
    )
    if (response.type !== 'result' || response.revision !== dataset.revision) {
      throw new Error('Occurrence search worker returned a stale revision.')
    }
    return response.result
  }

  private request(
    worker: WorkerLike,
    request: unknown,
    signal: AbortSignal,
  ): Promise<WorkspaceOccurrenceSearchWorkerResponse> {
    const requestId = (request as { id: number }).id
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout)
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
        signal.removeEventListener('abort', onAbort)
      }
      const onMessage: WorkerListener = (value) => {
        const message = value as WorkspaceOccurrenceSearchWorkerResponse
        if (message.id !== requestId) return
        cleanup()
        if (message.ok) resolve(message)
        else reject(new Error(message.error))
      }
      const onError: WorkerListener = (value) => {
        cleanup()
        reject(toError(value))
      }
      const onExit: WorkerListener = (value) => {
        cleanup()
        reject(new Error(`Occurrence search worker exited: ${String(value)}`))
      }
      const onAbort = () => {
        cleanup()
        void this.resetWorker()
        reject(abortError())
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Workspace occurrence search timed out.'))
      }, this.timeoutMs)
      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)
      signal.addEventListener('abort', onAbort, { once: true })
      worker.postMessage(request)
    })
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.on('error', () => this.releaseWorker(worker))
    worker.on('exit', () => this.releaseWorker(worker))
    this.worker = worker
    return this.worker
  }

  private releaseWorker(worker: WorkerLike): void {
    if (this.worker !== worker) return
    this.worker = null
    this.workerRevision = ''
  }

  private async resetWorker(): Promise<void> {
    const worker = this.worker
    this.worker = null
    this.workerRevision = ''
    if (worker) await worker.terminate().catch(() => undefined)
  }
}

const createOccurrenceSearchWorker = (): WorkerLike =>
  new Worker(resolveOccurrenceSearchWorkerEntry(import.meta.url), {
    type: 'module',
  } as WorkerOptions) as unknown as WorkerLike

export const resolveOccurrenceSearchWorkerEntry = (moduleUrl: string): string => {
  const directory = dirname(fileURLToPath(moduleUrl))
  const fileName = 'workspaceOccurrenceSearchWorkerEntry.js'
  const candidates = [join(directory, fileName), join(directory, '..', fileName)]
  return candidates.find(existsSync) ?? candidates[0]
}

const abortError = (): Error => {
  const error = new Error('Workspace occurrence search was cancelled.')
  error.name = 'AbortError'
  return error
}

const disposedError = (): Error => new Error('Workspace occurrence search worker is disposed.')

const linkAbortSignal = (
  source: AbortSignal | undefined,
  target: AbortController,
): (() => void) => {
  if (!source) return () => undefined
  const abort = () => target.abort()
  source.addEventListener('abort', abort, { once: true })
  return () => source.removeEventListener('abort', abort)
}

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value))
