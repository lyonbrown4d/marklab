import { useEffect, useRef, useState } from 'react'
import {
  summarizeTerminalExit,
  summarizeTerminalOutput,
  type ExportTaskEntry,
  type ExportTaskPayload,
  type TerminalEventEntry,
} from '@/components/status-center/statusCenterModel'
import { terminalExitEventSchema, terminalOutputEventSchema } from '@/services/terminalApi'
import { listen } from '@/runtime/events'

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

    let disposed = false
    let outputUnlisten: (() => void) | undefined
    let exitUnlisten: (() => void) | undefined

    const pushTerminalEvent = (entry: TerminalEventEntry) => {
      setTerminalEvents((current) =>
        [
          entry,
          ...current.filter((item) => !(item.id === entry.id && item.status === entry.status)),
        ].slice(0, 5),
      )
    }

    void listen<unknown>('terminal-output', (event) => {
      const parsed = terminalOutputEventSchema.safeParse(event.payload)
      if (!parsed.success) return

      const now = Date.now()
      if (now - lastTerminalOutputAtRef.current < 1_000) return
      lastTerminalOutputAtRef.current = now

      pushTerminalEvent({
        id: parsed.data.id,
        status: 'running',
        message: summarizeTerminalOutput(parsed.data),
        updatedAt: now,
      })
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten()
        return
      }
      outputUnlisten = nextUnlisten
    })

    void listen<unknown>('terminal-exit', (event) => {
      const parsed = terminalExitEventSchema.safeParse(event.payload)
      if (!parsed.success) return

      pushTerminalEvent({
        id: parsed.data.id,
        status: 'exited',
        message: summarizeTerminalExit(parsed.data),
        updatedAt: Date.now(),
      })
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten()
        return
      }
      exitUnlisten = nextUnlisten
    })

    return () => {
      disposed = true
      outputUnlisten?.()
      exitUnlisten?.()
    }
  }, [desktopRuntime])

  return { exportTasks, terminalEvents }
}
