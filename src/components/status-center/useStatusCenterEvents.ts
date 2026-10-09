import { useEffect, useRef, useState } from 'react'
import { map, merge, throttleTime } from 'rxjs'
import {
  summarizeTerminalExit,
  summarizeTerminalOutput,
  upsertRecentExportTask,
  type ExportTaskEntry,
  type ExportTaskPayload,
  type TerminalEventEntry,
} from '@/components/status-center/statusCenterModel'
import { listen } from '@/runtime/events'
import { useI18n } from '@/i18n/useI18n'
import { terminalExitEvents$, terminalOutputEvents$ } from '@/services/terminalEventStreams'

export const useStatusCenterEvents = (desktopRuntime: boolean) => {
  const { t } = useI18n()
  const translateRef = useRef(t)
  const [exportTasks, setExportTasks] = useState<Record<string, ExportTaskEntry>>({})
  const [terminalEvents, setTerminalEvents] = useState<TerminalEventEntry[]>([])
  const [eventError, setEventError] = useState<string | null>(null)

  useEffect(() => {
    translateRef.current = t
  }, [t])

  useEffect(() => {
    if (!desktopRuntime) return

    let disposed = false
    let unlisten: (() => void) | undefined

    void Promise.resolve()
      .then(() =>
        listen<ExportTaskPayload>('export-task', (event) => {
          const task = event.payload
          setExportTasks((current) => upsertRecentExportTask(current, task))
        }),
      )
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten()
          return
        }
        unlisten = nextUnlisten
      })
      .catch((error: unknown) => {
        if (!disposed) setEventError(error instanceof Error ? error.message : String(error))
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

    const subscription = merge(
      terminalOutputEvents$.pipe(
        throttleTime(1_000, undefined, { leading: true, trailing: false }),
        map((event) => ({
          id: event.id,
          status: 'running' as const,
          message: summarizeTerminalOutput(event, (key, options) =>
            translateRef.current(key, options),
          ),
          updatedAt: Date.now(),
        })),
      ),
      terminalExitEvents$.pipe(
        map((event) => ({
          id: event.id,
          status: 'exited' as const,
          message: summarizeTerminalExit(event, (key, options) =>
            translateRef.current(key, options),
          ),
          updatedAt: Date.now(),
        })),
      ),
    ).subscribe({
      error: (error: unknown) =>
        setEventError(error instanceof Error ? error.message : String(error)),
      next: pushTerminalEvent,
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [desktopRuntime])

  return { eventError, exportTasks, terminalEvents }
}
