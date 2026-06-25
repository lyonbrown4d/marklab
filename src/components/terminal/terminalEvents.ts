import { filter, Subject, Subscription } from 'rxjs'
import { type TerminalExitEvent, type TerminalOutputEvent } from '@/services/terminalApi'
import { terminalExitEvents$, terminalOutputEvents$ } from '@/services/terminalEventStreams'
import { isDesktopRuntime } from '@/runtime/environment'

type TerminalEventHandlers = {
  onExit: (event: TerminalExitEvent) => void
  onOutput: (event: TerminalOutputEvent) => void
}

const MAX_PENDING_OUTPUT_CHUNKS = 128

const terminalExitSubject = new Subject<TerminalExitEvent>()
const terminalOutputSubject = new Subject<TerminalOutputEvent>()
const sessionSubscriberCounts = new Map<string, number>()
const pendingOutputEvents = new Map<string, TerminalOutputEvent[]>()

let listenerSubscription: Subscription | null = null

const updateSubscriberCount = (sessionId: string, delta: 1 | -1) => {
  const nextCount = Math.max(0, (sessionSubscriberCounts.get(sessionId) ?? 0) + delta)
  if (nextCount === 0) {
    sessionSubscriberCounts.delete(sessionId)
    return
  }
  sessionSubscriberCounts.set(sessionId, nextCount)
}

const dispatchOutput = (event: TerminalOutputEvent) => {
  if (!sessionSubscriberCounts.has(event.id)) {
    const pending = pendingOutputEvents.get(event.id) ?? []
    pending.push(event)
    if (pending.length > MAX_PENDING_OUTPUT_CHUNKS) pending.shift()
    pendingOutputEvents.set(event.id, pending)
    return
  }

  terminalOutputSubject.next(event)
}

const dispatchExit = (event: TerminalExitEvent) => {
  pendingOutputEvents.delete(event.id)
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

  const pending = pendingOutputEvents.get(sessionId)
  if (pending) {
    pendingOutputEvents.delete(sessionId)
    for (const event of pending) handlers.onOutput(event)
  }

  return () => {
    subscription.unsubscribe()
    updateSubscriberCount(sessionId, -1)
  }
}
