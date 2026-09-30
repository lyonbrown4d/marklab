import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { type WorkerOptions, Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

import type {
  NodeSearchWorkerBuildRequest,
  NodeSearchWorkerBuildResult,
  NodeSearchWorkerResponse,
} from '@electron/services/knowledgeEngine/nodeSearchWorkerMessages.js'

export type NodeSearchWorkerRunner = {
  available: boolean
  run: (
    request: NodeSearchWorkerBuildRequest,
    signal: AbortSignal,
  ) => Promise<NodeSearchWorkerBuildResult>
}

type ScheduledTask = {
  aborted: boolean
  resolve: (release: () => void) => void
}

export class NodeSearchWorkerScheduler {
  private active = 0
  private readonly waiting: ScheduledTask[] = []

  constructor(readonly maximumParallelism: number) {}

  async run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const release = await this.acquire(signal)
    try {
      return await task()
    } finally {
      release()
    }
  }

  private acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(abortError())
    if (this.maximumParallelism < 1) {
      return Promise.reject(new Error('No parallel CPU is available for Node search workers.'))
    }
    if (this.active < this.maximumParallelism) {
      this.active += 1
      return Promise.resolve(() => this.release())
    }
    return new Promise((resolve, reject) => {
      const scheduled: ScheduledTask = { aborted: false, resolve }
      const onAbort = () => {
        scheduled.aborted = true
        reject(abortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      scheduled.resolve = (release) => {
        signal.removeEventListener('abort', onAbort)
        resolve(release)
      }
      this.waiting.push(scheduled)
    })
  }

  private release(): void {
    while (this.waiting.length > 0) {
      const next = this.waiting.shift()
      if (!next || next.aborted) continue
      next.resolve(() => this.release())
      return
    }
    this.active -= 1
  }
}

export const nodeSearchWorkerParallelism = Math.min(Math.max(availableParallelism() - 1, 0), 4)

const scheduler = new NodeSearchWorkerScheduler(nodeSearchWorkerParallelism)
const workerEntryPath = join(dirname(fileURLToPath(import.meta.url)), 'nodeSearchWorkerEntry.js')

export const nodeSearchWorkerRunner: NodeSearchWorkerRunner = {
  available: nodeSearchWorkerParallelism > 0,
  run: (request, signal) => scheduler.run(() => runWorkerThread(request, signal), signal),
}

const runWorkerThread = (
  request: NodeSearchWorkerBuildRequest,
  signal: AbortSignal,
): Promise<NodeSearchWorkerBuildResult> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const worker = new Worker(workerEntryPath, { type: 'module' } as WorkerOptions)
    let settled = false
    const finish = (result: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      worker.removeAllListeners()
      result()
    }
    const onAbort = () => {
      finish(() => {
        void worker.terminate()
        reject(abortError())
      })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    worker.once('message', (message: NodeSearchWorkerResponse) => {
      finish(() => {
        void worker.terminate()
        if (message.ok) resolve(message.payload)
        else reject(new Error(message.error))
      })
    })
    worker.once('error', (error) => {
      finish(() => {
        void worker.terminate()
        reject(error)
      })
    })
    worker.once('exit', (code) => {
      finish(() => reject(new Error(`Node search worker exited before responding (${code}).`)))
    })
    worker.postMessage(request)
  })

const abortError = (): Error => {
  const error = new Error('Node search worker build aborted.')
  error.name = 'AbortError'
  return error
}
