import mitt from 'mitt'
import {
  terminalExitEventSchema,
  terminalOutputEventSchema,
  type TerminalExitEvent,
  type TerminalOutputEvent,
} from '@/services/terminalApi'
import { listen, type RuntimeUnlistenFn } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'

type TerminalEventHandlers = {
  onExit: (event: TerminalExitEvent) => void
  onOutput: (event: TerminalOutputEvent) => void
}

const MAX_PENDING_OUTPUT_CHUNKS = 128

type TerminalEventBus = {
  exit: TerminalExitEvent
  output: TerminalOutputEvent
}

const terminalEvents = mitt<TerminalEventBus>()
const sessionSubscriberCounts = new Map<string, number>()
const pendingOutputEvents = new Map<string, TerminalOutputEvent[]>()

let listenerPromise: Promise<void> | null = null
let outputUnlisten: RuntimeUnlistenFn | null = null
let exitUnlisten: RuntimeUnlistenFn | null = null

function updateSubscriberCount(sessionId: string, delta: 1 | -1) {
  const nextCount = Math.max(0, (sessionSubscriberCounts.get(sessionId) ?? 0) + delta)
  if (nextCount === 0) {
    sessionSubscriberCounts.delete(sessionId)
    return
  }
  sessionSubscriberCounts.set(sessionId, nextCount)
}

function dispatchOutput(event: TerminalOutputEvent) {
  if (!sessionSubscriberCounts.has(event.id)) {
    const pending = pendingOutputEvents.get(event.id) ?? []
    pending.push(event)
    if (pending.length > MAX_PENDING_OUTPUT_CHUNKS) pending.shift()
    pendingOutputEvents.set(event.id, pending)
    return
  }

  terminalEvents.emit('output', event)
}

function dispatchExit(event: TerminalExitEvent) {
  pendingOutputEvents.delete(event.id)
  terminalEvents.emit('exit', event)
}

function ensureTerminalEventListeners() {
  if (!isDesktopRuntime() || listenerPromise) return

  listenerPromise = Promise.resolve()
    .then(async () => {
      outputUnlisten = await listen<unknown>('terminal-output', (event) => {
        const payload = terminalOutputEventSchema.safeParse(event.payload)
        if (payload.success) dispatchOutput(payload.data)
      })
      exitUnlisten = await listen<unknown>('terminal-exit', (event) => {
        const payload = terminalExitEventSchema.safeParse(event.payload)
        if (payload.success) dispatchExit(payload.data)
      })
    })
    .catch(() => {
      listenerPromise = null
      outputUnlisten?.()
      exitUnlisten?.()
      outputUnlisten = null
      exitUnlisten = null
    })
}

export function primeTerminalEventListeners() {
  ensureTerminalEventListeners()
}

export function subscribeTerminalSessionEvents(sessionId: string, handlers: TerminalEventHandlers) {
  ensureTerminalEventListeners()
  updateSubscriberCount(sessionId, 1)

  const handleOutput = (event: TerminalOutputEvent) => {
    if (event.id === sessionId) handlers.onOutput(event)
  }
  const handleExit = (event: TerminalExitEvent) => {
    if (event.id === sessionId) handlers.onExit(event)
  }

  terminalEvents.on('output', handleOutput)
  terminalEvents.on('exit', handleExit)

  const pending = pendingOutputEvents.get(sessionId)
  if (pending) {
    pendingOutputEvents.delete(sessionId)
    for (const event of pending) handlers.onOutput(event)
  }

  return () => {
    terminalEvents.off('output', handleOutput)
    terminalEvents.off('exit', handleExit)
    updateSubscriberCount(sessionId, -1)
  }
}
