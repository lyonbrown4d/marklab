import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ElectronRuntimeEventEnvelope } from '@/runtime/electron'
import { commandAliases, legacyCommands, runtimeEvents } from '@/runtime/tauri/contract'

export const request = <T>(command: string, payload: unknown = {}): Promise<T> =>
  invoke<T>(command, { request: payload }).catch((error: unknown) => {
    if (error instanceof Error) throw error
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      const normalized = new Error(error.message)
      if ('code' in error && typeof error.code === 'string')
        Object.assign(normalized, { code: error.code })
      throw normalized
    }
    throw new Error(typeof error === 'string' ? error : 'Desktop operation failed.')
  })

const commandAllowlist: ReadonlySet<string> = new Set(legacyCommands)
export const invokeLegacyCommand = async <T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> => {
  if (!commandAllowlist.has(command)) {
    throw new Error(`Unsupported command: ${command}`)
  }
  if (command === 'fs_import_markdown_asset_bytes') {
    const bytes = payload?.bytes
    if (!(bytes instanceof ArrayBuffer) && !(bytes instanceof Uint8Array)) {
      throw new Error('Asset import requires binary bytes.')
    }
    if (bytes.byteLength > 32 * 1024 * 1024)
      throw new Error('Asset exceeds the 32 MiB import limit.')
    // This specific compatibility DTO needs JSON bytes; ArrayBuffer otherwise
    // becomes {} across Tauri IPC. No unrelated request data is traversed.
    return request<T>(command, {
      ...payload,
      bytes: Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)),
    })
  }
  return request<T>(commandAliases[command] ?? command, payload ?? {})
}

export const nativeEvents = [
  ...runtimeEvents,
  'ai-completion-event',
  'window-opening-progress',
  'window-presented',
  'recent-workspaces-changed',
  'updates-event',
  'web-tabs-state',
  'sync-progress',
  'window-flush-requested',
  'workspace-tree-changed',
  'workspace-generation-changed',
] as const

type EventHandler = (event: ElectronRuntimeEventEnvelope) => void
const replayEvents = new Set<string>([
  'workspace-session-seed',
  'window-opening-progress',
  'window-presented',
])

// Listeners are installed before React loads, so streaming starts cannot outrun
// their subscriptions and initial workspace seeds survive late React mounts.
export const createEventHub = () => {
  const handlers = new Map<string, Set<EventHandler>>()
  const latest = new Map<string, ElectronRuntimeEventEnvelope>()
  const unlisten: UnlistenFn[] = []
  let nextId = 0
  let nativeAttempt: number | undefined
  let nativeGeneration: number | undefined
  const publish = (event: string, payload: unknown): void => {
    if (event === 'workspace-session-seed' && payload && typeof payload === 'object') {
      const {
        nativeAttempt: attempt,
        nativeGeneration: generation,
        ...seed
      } = payload as Record<string, unknown>
      if (typeof attempt === 'number' && Number.isSafeInteger(attempt) && attempt > 0) {
        if (nativeAttempt !== undefined && attempt < nativeAttempt) return
        nativeAttempt = attempt
      }
      if (typeof generation === 'number' && Number.isSafeInteger(generation) && generation > 0) {
        nativeGeneration = generation
      }
      payload = seed
    }
    if (event === 'workspace-generation-changed') {
      if (payload && typeof payload === 'object' && 'generation' in payload) {
        const generation = payload.generation
        if (typeof generation === 'number' && Number.isSafeInteger(generation) && generation > 0)
          nativeGeneration = generation
      }
      return
    }
    if (
      event === 'fs-buffer-status' &&
      payload &&
      typeof payload === 'object' &&
      'session_generation' in payload
    ) {
      const { session_generation: generation, ...status } = payload
      if (generation !== nativeGeneration) return
      payload = status
    }
    const envelope = { event, id: ++nextId, payload }
    if (replayEvents.has(event)) latest.set(event, envelope)
    for (const handler of handlers.get(event) ?? []) handler(envelope)
  }
  const subscribe = <T>(
    event: string,
    handler: (event: ElectronRuntimeEventEnvelope<T>) => void,
  ): UnlistenFn => {
    if (!nativeEvents.some((name) => name === event)) {
      throw new Error(`Unsupported event: ${event}`)
    }
    const listeners = handlers.get(event) ?? new Set<EventHandler>()
    handlers.set(event, listeners)
    const receive: EventHandler = (envelope) => handler(envelope as ElectronRuntimeEventEnvelope<T>)
    listeners.add(receive)
    const cached = latest.get(event)
    if (cached) receive(cached)
    return () => listeners.delete(receive)
  }
  const on = <T>(event: string, handler: (payload: T) => void): UnlistenFn =>
    subscribe<T>(event, ({ payload }) => handler(payload))
  return {
    on,
    publish,
    subscribe,
    has: (event: string) => latest.has(event),
    attempt: () => nativeAttempt,
    install: async (): Promise<void> => {
      try {
        // Sequential registration permits complete cleanup on partial failure.
        for (const name of nativeEvents) {
          unlisten.push(await listen(name, ({ payload }) => publish(name, payload)))
        }
      } catch (error) {
        for (const stop of unlisten.splice(0)) stop()
        throw error
      }
    },
    dispose: (): void => {
      for (const stop of unlisten.splice(0)) stop()
      handlers.clear()
      latest.clear()
    },
  }
}

export type TauriEventHub = ReturnType<typeof createEventHub>
