import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  desktopCommands,
  desktopCommandNames,
  desktopEventNames,
  type DesktopCommandArgs,
  type DesktopCommandName,
  type DesktopCommandResults,
  type DesktopEventPayloads,
} from '@/generated/desktop/bindings'
import type { DesktopRuntimeEventEnvelope } from '@/runtime/desktop'
import {
  commandAliases,
  type NativeCommandName,
  type NativeCommandRequest,
  type RuntimeCommandName,
  type RuntimeCommandParameters,
  type RuntimeCommandResult,
  type RuntimeEventName,
  type RuntimeEventPayloads,
} from '@/runtime/tauri/contract'

// Preserve the generated key/argument/result relationship when selecting a command dynamically.
const generatedCommands: {
  [C in DesktopCommandName]: (args: DesktopCommandArgs[C]) => Promise<DesktopCommandResults[C]>
} = desktopCommands

export const request = <C extends DesktopCommandName>(
  command: C,
  ...args: Record<string, never> extends NativeCommandRequest<C>
    ? [payload?: NativeCommandRequest<C>]
    : [payload: NativeCommandRequest<C>]
): Promise<DesktopCommandResults[C]> =>
  generatedCommands[command]({ request: args[0] ?? {} } as DesktopCommandArgs[C]).catch(
    normalizeNativeError,
  )

const commandAllowlist: ReadonlySet<string> = new Set(desktopCommandNames)
export const invokeWorkspaceCommand = async <C extends RuntimeCommandName>(
  command: C,
  ...args: RuntimeCommandParameters<C>
): Promise<RuntimeCommandResult<C>> => {
  const nativeCommand = (
    command in commandAliases ? commandAliases[command as keyof typeof commandAliases] : command
  ) as NativeCommandName<C>
  if (!commandAllowlist.has(nativeCommand)) throw new Error(`Unsupported command: ${command}`)
  const payload = args[0]
  if (command === 'fs_import_markdown_asset_bytes') {
    const input = payload as RuntimeCommandParameters<'fs_import_markdown_asset_bytes'>[0]
    const bytes = input.bytes
    if (!(bytes instanceof ArrayBuffer) && !(bytes instanceof Uint8Array)) {
      throw new Error('Asset import requires binary bytes.')
    }
    if (bytes.byteLength > 32 * 1024 * 1024)
      throw new Error('Asset exceeds the 32 MiB import limit.')
    // Only this DTO carries binary data; a typed-array view must not leak its backing buffer.
    return generatedCommands[nativeCommand]({
      request: {
        ...input,
        bytes: Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)),
      },
    } as DesktopCommandArgs[NativeCommandName<C>]).catch(normalizeNativeError)
  }
  return generatedCommands[nativeCommand]({
    request: payload ?? {},
  } as DesktopCommandArgs[NativeCommandName<C>]).catch(normalizeNativeError)
}

const normalizeNativeError = (error: unknown): never => {
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
}

export const nativeEvents = desktopEventNames

type EventHandler = (event: DesktopRuntimeEventEnvelope) => void
const replayEvents = new Set<keyof DesktopEventPayloads>([
  'workspace-session-seed',
  'window-opening-progress',
  'window-presented',
])

// Listeners are installed before React loads, so streaming starts cannot outrun
// their subscriptions and initial workspace seeds survive late React mounts.
export const createEventHub = () => {
  const handlers = new Map<string, Set<EventHandler>>()
  const latest = new Map<string, DesktopRuntimeEventEnvelope>()
  const unlisten: UnlistenFn[] = []
  let nextId = 0
  let nativeAttempt: number | undefined
  let nativeGeneration: number | undefined
  const receiveNative = (event: keyof DesktopEventPayloads, payload: unknown): void => {
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
      event === 'link-preview-updated' &&
      payload &&
      typeof payload === 'object' &&
      'generation' in payload &&
      payload.generation !== nativeGeneration
    )
      return
    if (
      event === 'fs-buffer-status' &&
      payload &&
      typeof payload === 'object' &&
      'session_generation' in payload
    ) {
      const { session_generation: generation } = payload
      if (generation !== nativeGeneration) return
    }
    const envelope = { event, id: ++nextId, payload }
    if (replayEvents.has(event)) latest.set(event, envelope)
    for (const handler of handlers.get(event) ?? []) handler(envelope)
  }
  const publish = <E extends keyof DesktopEventPayloads>(
    event: E,
    payload: DesktopEventPayloads[E],
  ): void => receiveNative(event, payload)
  const subscribe = <E extends RuntimeEventName>(
    event: E,
    handler: (event: DesktopRuntimeEventEnvelope<RuntimeEventPayloads[E]>) => void,
  ): UnlistenFn => {
    if (!nativeEvents.some((name) => name === event)) {
      throw new Error(`Unsupported event: ${event}`)
    }
    const listeners = handlers.get(event) ?? new Set<EventHandler>()
    handlers.set(event, listeners)
    const receive: EventHandler = (envelope) =>
      handler(envelope as DesktopRuntimeEventEnvelope<RuntimeEventPayloads[E]>)
    listeners.add(receive)
    const cached = latest.get(event)
    if (cached) receive(cached)
    return () => listeners.delete(receive)
  }
  const on = <E extends RuntimeEventName>(
    event: E,
    handler: (payload: RuntimeEventPayloads[E]) => void,
  ): UnlistenFn => subscribe(event, ({ payload }) => handler(payload))
  return {
    on,
    publish,
    subscribe,
    has: (event: RuntimeEventName) => latest.has(event),
    attempt: () => nativeAttempt,
    install: async (): Promise<void> => {
      try {
        const target = { kind: 'WebviewWindow' as const, label: getCurrentWindow().label }
        // Sequential registration permits complete cleanup on partial failure.
        for (const name of nativeEvents) {
          unlisten.push(
            await listen<DesktopEventPayloads[typeof name]>(
              name,
              ({ payload }) => publish(name, payload),
              { target },
            ),
          )
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
