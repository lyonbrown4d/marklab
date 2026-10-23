import { filter, Subject, Subscription } from 'rxjs'
import { type TerminalExitEvent, type TerminalOutputEvent } from '@/services/terminalApi'
import { terminalExitEvents$, terminalOutputEvents$ } from '@/services/terminalEventStreams'
import { isDesktopRuntime } from '@/runtime/environment'

type TerminalEventHandlers = {
  onExit: (event: TerminalExitEvent) => void
  onOutput: (event: TerminalOutputEvent) => void
}

const MAX_PENDING_EVENTS = 128
const MAX_PENDING_SESSIONS = 32
const MAX_PENDING_CHARACTERS = 128 * 1024
const MAX_RETIRED_SESSIONS = 128

type PendingTerminalEvent =
  { type: 'output'; event: TerminalOutputEvent } | { type: 'exit'; event: TerminalExitEvent }

const terminalExitSubject = new Subject<TerminalExitEvent>()
const terminalOutputSubject = new Subject<TerminalOutputEvent>()
const sessionSubscriberCounts = new Map<string, number>()
const pendingEvents = new Map<string, PendingTerminalEvent[]>()
const retiredSessions = new Set<string>()

let listenerSubscription: Subscription | null = null

const updateSubscriberCount = (sessionId: string, delta: 1 | -1) => {
  const nextCount = Math.max(0, (sessionSubscriberCounts.get(sessionId) ?? 0) + delta)
  if (nextCount === 0) {
    sessionSubscriberCounts.delete(sessionId)
    return
  }
  sessionSubscriberCounts.set(sessionId, nextCount)
}

const bufferEvent = (pendingEvent: PendingTerminalEvent) => {
  const id = pendingEvent.event.id
  if (retiredSessions.has(id)) return
  const pending = pendingEvents.get(id) ?? []
  if (pending.at(-1)?.type === 'exit') return
  if (pendingEvent.type === 'output') {
    pendingEvent = {
      type: 'output',
      event: {
        ...pendingEvent.event,
        data: pendingEvent.event.data.slice(-MAX_PENDING_CHARACTERS),
      },
    }
  }
  pending.push(pendingEvent)
  let characters = pending.reduce(
    (total, item) => total + (item.type === 'output' ? item.event.data.length : 0),
    0,
  )
  while (pending.length > MAX_PENDING_EVENTS || characters > MAX_PENDING_CHARACTERS) {
    const removed = pending.shift()
    if (removed?.type === 'output') characters -= removed.event.data.length
  }
  pendingEvents.delete(id)
  pendingEvents.set(id, pending)
  if (pendingEvents.size > MAX_PENDING_SESSIONS) {
    const oldestId = pendingEvents.keys().next().value
    if (oldestId !== undefined) pendingEvents.delete(oldestId)
  }
}

export const clearTerminalSessionEvents = (sessionId: string) => {
  pendingEvents.delete(sessionId)
  retiredSessions.add(sessionId)
  if (retiredSessions.size > MAX_RETIRED_SESSIONS) {
    const oldestId = retiredSessions.values().next().value
    if (oldestId !== undefined) retiredSessions.delete(oldestId)
  }
}

const dispatchOutput = (event: TerminalOutputEvent) => {
  if (retiredSessions.has(event.id)) return
  if (!sessionSubscriberCounts.has(event.id)) {
    bufferEvent({ type: 'output', event })
    return
  }
  terminalOutputSubject.next(event)
}

const dispatchExit = (event: TerminalExitEvent) => {
  if (retiredSessions.has(event.id)) return
  if (!sessionSubscriberCounts.has(event.id)) {
    bufferEvent({ type: 'exit', event })
    return
  }
  terminalExitSubject.next(event)
}

const ensureTerminalEventListeners = () => {
  if (!isDesktopRuntime() || listenerSubscription) return

  listenerSubscription = new Subscription()
  listenerSubscription.add(
    terminalOutputEvents$.subscribe({
      error: () => {
        listenerSubscription?.unsubscribe()
        listenerSubscription = null
      },
      next: dispatchOutput,
    }),
  )
  listenerSubscription.add(
    terminalExitEvents$.subscribe({
      error: () => {
        listenerSubscription?.unsubscribe()
        listenerSubscription = null
      },
      next: dispatchExit,
    }),
  )
}

export const primeTerminalEventListeners = () => {
  ensureTerminalEventListeners()
}

export const subscribeTerminalSessionEvents = (
  sessionId: string,
  handlers: TerminalEventHandlers,
) => {
  ensureTerminalEventListeners()
  updateSubscriberCount(sessionId, 1)

  const subscription = new Subscription()
  subscription.add(
    terminalOutputSubject.pipe(filter((event) => event.id === sessionId)).subscribe({
      next: handlers.onOutput,
    }),
  )
  subscription.add(
    terminalExitSubject.pipe(filter((event) => event.id === sessionId)).subscribe({
      next: handlers.onExit,
    }),
  )

  const pending = pendingEvents.get(sessionId)
  if (pending) {
    pendingEvents.delete(sessionId)
    for (const item of pending) {
      if (item.type === 'output') handlers.onOutput(item.event)
      else handlers.onExit(item.event)
    }
  }

  return () => {
    subscription.unsubscribe()
    updateSubscriberCount(sessionId, -1)
  }
}
