import { useEffect, useRef, useState } from 'react'
import {
  summarizeTerminalExit,
  summarizeTerminalOutput,
  type ExportTaskEntry,
  type ExportTaskPayload,
  type TerminalEventEntry,
} from '@/components/status-center/statusCenterModel'
import { listen } from '@/runtime/events'
import { terminalExitEvents$, terminalOutputEvents$ } from '@/services/terminalEventStreams'

export const useStatusCenterEvents = (desktopRuntime: boolean) => {
  const [exportTasks, setExportTasks] = useState<Record<string, ExportTaskEntry>>({})
  const [terminalEvents, setTerminalEvents] = useState<TerminalEventEntry[]>([])
  const lastTerminalOutputAtRef = useRef(0)

  useEffect(() => {
    if (!desktopRuntime) return

    let disposed = false
    let unlisten: (() => void) | undefined

    void listen<ExportTaskPayload>('export-task', (event) => {
      const task = event.payload
      setExportTasks((current) => ({
        ...current,
        [task.id]: {
          ...task,
          updatedAt: Date.now(),
        },
      }))
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten()
        return
      }
      unlisten = nextUnlisten
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [desktopRuntime])

  useEffect(() => {
    if (!desktopRuntime) return

    const pushTerminalEvent = (entry: TerminalEventEntry) => {
      setTerminalEvents((current) =>
        [
          entry,
          ...current.filter((item) => !(item.id === entry.id && item.status === entry.status)),
        ].slice(0, 5),
      )
    }

    const outputSubscription = terminalOutputEvents$.subscribe({
      error: () => undefined,
      next: (event) => {
        const now = Date.now()
        if (now - lastTerminalOutputAtRef.current < 1_000) return
        lastTerminalOutputAtRef.current = now

        pushTerminalEvent({
          id: event.id,
          status: 'running',
          message: summarizeTerminalOutput(event),
          updatedAt: now,
        })
      },
    })

    const exitSubscription = terminalExitEvents$.subscribe({
      error: () => undefined,
      next: (event) => {
        pushTerminalEvent({
          id: event.id,
          status: 'exited',
          message: summarizeTerminalExit(event),
          updatedAt: Date.now(),
        })
      },
    })

    return () => {
      outputSubscription.unsubscribe()
      exitSubscription.unsubscribe()
    }
  }, [desktopRuntime])

  return { exportTasks, terminalEvents }
}
