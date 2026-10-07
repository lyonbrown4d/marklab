import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type WorkerOptions, Worker } from 'node:worker_threads'

import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type {
  OccurrenceSearchInput,
  OccurrenceSearchOutput,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'
import type { WorkspaceOccurrenceSearchWorkerResponse } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerMessages'

const DEFAULT_TIMEOUT_MS = 2_000

type WorkerListener = (...args: unknown[]) => void
type WorkerLike = {
  off: (event: string, listener: WorkerListener) => unknown
  on: (event: string, listener: WorkerListener) => unknown
  postMessage: (value: unknown) => void
  terminate: () => Promise<number>
}

type WorkerClientOptions = {
  createWorker?: () => WorkerLike
  timeoutMs?: number
}

export class WorkspaceOccurrenceSearchWorkerClient {
  private readonly createWorker: () => WorkerLike
  private readonly timeoutMs: number

  constructor(options: WorkerClientOptions = {}) {
    this.createWorker = options.createWorker ?? createOccurrenceSearchWorker
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  run(
    documents: WorkspaceSearchDocument[],
    input: OccurrenceSearchInput,
    signal?: AbortSignal,
  ): Promise<OccurrenceSearchOutput> {
    if (signal?.aborted) return Promise.reject(abortError())
    const worker = this.createWorker()
    return new Promise<OccurrenceSearchOutput>((resolve, reject) => {
      let settled = false
      const settle = (result: { value?: OccurrenceSearchOutput; error?: Error }) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
        worker.off('message', onMessage as never)
        worker.off('error', onError as never)
        worker.off('exit', onExit as never)
        void worker.terminate()
        if (result.error) reject(result.error)
        else resolve(result.value ?? { results: [], totalHits: 0 })
      }
      const onAbort = () => settle({ error: abortError() })
      const onError = (error: Error) => settle({ error })
      const onExit = (code: number) => {
        if (code !== 0) settle({ error: new Error(`Occurrence search worker exited: ${code}`) })
      }
      const onMessage = (message: WorkspaceOccurrenceSearchWorkerResponse) => {
        if (message.id !== 1) return
        if (message.ok) settle({ value: message.result })
        else settle({ error: new Error(message.error) })
      }
      const timeout = setTimeout(
        () => settle({ error: new Error('Workspace occurrence search timed out.') }),
        this.timeoutMs,
      )
      signal?.addEventListener('abort', onAbort, { once: true })
      worker.on('message', onMessage as never)
      worker.on('error', onError as never)
      worker.on('exit', onExit as never)
      worker.postMessage({ documents, id: 1, input })
    })
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
