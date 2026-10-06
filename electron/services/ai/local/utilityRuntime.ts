import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ForkOptions } from 'electron'

import type {
  LocalAiEventHandler,
  LocalAiRuntimeContract,
  LocalAiRuntimeRequest,
  LocalAiRuntimeStatus,
} from '@electron/services/ai/local/types'
import {
  isLocalAiUtilityResponse,
  type LocalAiUtilityRequest,
} from '@electron/services/ai/local/utilityProtocol'

type UtilityProcessLike = {
  kill: () => boolean
  on(event: 'exit', listener: (code: number) => void): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  once(event: 'exit', listener: (code: number) => void): unknown
  once(event: 'spawn', listener: () => void): unknown
  postMessage: (message: LocalAiUtilityRequest) => void
}

type ForkUtilityProcess = (
  modulePath: string,
  args: string[],
  options: ForkOptions,
) => UtilityProcessLike

type UtilityLocalAiRuntimeOptions = {
  entryPath?: string
  fork?: ForkUtilityProcess
  idleTimeoutMs?: number
  architecture?: string
  shutdownTimeoutMs?: number
}

type PendingGeneration = { emit: LocalAiEventHandler; resolve: () => void }

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000

export class UtilityLocalAiRuntime implements LocalAiRuntimeContract {
  private utility: UtilityProcessLike | null = null
  private starting: Promise<UtilityProcessLike> | null = null
  private readonly pending = new Map<string, PendingGeneration>()
  private status: LocalAiRuntimeStatus
  private error: string | undefined
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private disposing: Promise<void> | null = null

  constructor(private readonly options: UtilityLocalAiRuntimeOptions = {}) {
    const architecture = options.architecture ?? process.arch
    this.status = architecture === 'x64' || architecture === 'arm64' ? 'idle' : 'unavailable'
  }

  getStatus(): LocalAiRuntimeStatus {
    return this.status
  }

  getError(): string | undefined {
    return this.error
  }

  async generate(request: LocalAiRuntimeRequest, emit: LocalAiEventHandler): Promise<void> {
    if (this.status === 'unavailable')
      throw new Error('Local AI is unavailable on this architecture')
    this.clearIdleTimer()
    const utility = await this.ensureUtility()
    return new Promise((resolve) => {
      this.pending.set(request.requestId, { emit, resolve })
      utility.postMessage({ type: 'generate', request })
    })
  }

  async cancel(requestId: string): Promise<void> {
    const utility = this.utility ?? (this.starting ? await this.starting : null)
    utility?.postMessage({ type: 'cancel', requestId })
  }

  async dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.disposing = this.disposeUtility()
    try {
      await this.disposing
    } finally {
      this.disposing = null
    }
  }

  private async disposeUtility(): Promise<void> {
    this.clearIdleTimer()
    const utility = this.utility ?? (this.starting ? await this.starting.catch(() => null) : null)
    if (utility) {
      const exited = waitForExit(utility)
      utility.postMessage({ type: 'shutdown' })
      const graceful = await waitForTimeout(
        exited,
        this.options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
      )
      if (!graceful) {
        utility.kill()
        await exited
      }
    }
    this.utility = null
    this.starting = null
    this.finishPending('Local AI runtime stopped')
    if (this.status !== 'unavailable') this.status = 'idle'
    this.error = undefined
  }

  private async ensureUtility(): Promise<UtilityProcessLike> {
    if (this.utility) return this.utility
    if (this.starting) return this.starting
    this.status = 'loading'
    this.error = undefined
    this.starting = this.startUtility()
    try {
      this.utility = await this.starting
      return this.utility
    } finally {
      this.starting = null
    }
  }

  private async startUtility(): Promise<UtilityProcessLike> {
    const fork = this.options.fork ?? (await import('electron')).utilityProcess.fork
    const entryPath = this.options.entryPath ?? resolveLocalAiUtilityEntry(import.meta.url)
    const utility = fork(entryPath, [], {
      serviceName: 'Marklab Local AI',
      stdio: 'ignore',
    })
    utility.on('message', (message) => this.handleMessage(message))
    utility.on('exit', (code) => this.handleExit(code))
    await waitForSpawn(utility)
    return utility
  }

  private handleMessage(message: unknown): void {
    if (!isLocalAiUtilityResponse(message)) return
    if (message.type === 'status') {
      this.status = message.status
      return
    }
    const pending = this.pending.get(message.event.requestId)
    if (!pending) return
    pending.emit(message.event)
    if (message.event.type !== 'delta') {
      this.pending.delete(message.event.requestId)
      pending.resolve()
      this.scheduleIdleStop()
    }
  }

  private handleExit(code: number): void {
    if (this.utility === null && this.status === 'idle') return
    this.utility = null
    this.starting = null
    if (code === 0 && this.pending.size === 0) {
      this.status = 'idle'
      return
    }
    this.status = 'error'
    this.error = 'Local AI runtime exited unexpectedly'
    this.finishPending(this.error)
  }

  private finishPending(message: string): void {
    for (const [requestId, pending] of this.pending) {
      pending.emit({ requestId, type: 'error', message })
      pending.resolve()
    }
    this.pending.clear()
  }

  private scheduleIdleStop(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(
      () => void this.dispose(),
      this.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    )
    this.idleTimer.unref?.()
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}

const waitForSpawn = (utility: UtilityProcessLike): Promise<void> =>
  new Promise((resolve, reject) => {
    utility.once('spawn', resolve)
    utility.once('exit', (code) => reject(new Error(`Local AI runtime failed to start (${code})`)))
  })

const waitForExit = (utility: UtilityProcessLike): Promise<void> =>
  new Promise((resolve) => utility.once('exit', () => resolve()))

const waitForTimeout = async (promise: Promise<void>, timeoutMs: number): Promise<boolean> => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<false>((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs)
    timeout.unref?.()
  })
  const result = await Promise.race([promise.then(() => true as const), expired])
  if (timeout) clearTimeout(timeout)
  return result
}

export const resolveLocalAiUtilityEntry = (moduleUrl: string): string => {
  const directory = path.dirname(fileURLToPath(moduleUrl))
  const candidates = [
    path.join(directory, 'localAiUtilityEntry.js'),
    path.join(directory, '..', '..', '..', 'localAiUtilityEntry.js'),
  ]
  return candidates.find(existsSync) ?? candidates[0]
}
