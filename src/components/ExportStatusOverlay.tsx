import { useEffect, useRef, type MouseEvent } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'
import { Spinner } from '@/components/ui/spinner'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { exportApi } from '@/services/exportApi'
import { ExportProgressDescription } from '@/components/ExportProgressDescription'

type ExportTaskStatus = 'started' | 'finished' | 'failed' | 'cancelled'

type ExportTaskPayload = {
  id: string
  format: string
  output_path: string
  status: ExportTaskStatus
  message?: string | null
  progress?: number | null
}

const getOutputName = (path: string) => {
  return path.split(/[/\\]/).pop() || path
}

const getFormatLabel = (format: string) => {
  if (format === 'docx') return 'Word'
  return format.toUpperCase()
}

const getToastDescription = (task: ExportTaskPayload) => {
  const outputName = getOutputName(task.output_path)
  if (task.status !== 'failed' || !task.message) return outputName
  return `${outputName} - ${task.message}`
}

const ExportStatusOverlay = () => {
  const { t } = useI18n()

  const translate = useRef(t)
  useEffect(() => {
    translate.current = t
  }, [t])

  useEffect(() => {
    if (!isDesktopRuntime()) return

    let unlisten: (() => void) | undefined
    let disposed = false
    const pendingActions = new Set<string>()
    const taskAction = (taskId: string, label: string, operation: () => Promise<unknown>) => {
      const actionId = `${taskId}-action`
      const retry = (event?: MouseEvent<HTMLButtonElement>) => {
        event?.preventDefault()
        if (disposed || pendingActions.has(taskId)) return
        pendingActions.add(taskId)
        void Promise.resolve()
          .then(operation)
          .then(() => {
            if (!disposed) toast.dismiss(actionId)
          })
          .catch((error: unknown) => {
            if (disposed) return
            toast.error(translate.current('context.actionFailed'), {
              id: actionId,
              description: error instanceof Error ? error.message : String(error),
              action: { label: translate.current('actions.retry'), onClick: retry },
            })
          })
          .finally(() => pendingActions.delete(taskId))
      }
      return { label, onClick: retry }
    }

    void listen('export-task', (event) => {
      if (disposed) return
      const t = translate.current
      const task = event.payload
      const format = getFormatLabel(task.format)
      const description = getToastDescription(task)

      if (task.status === 'started') {
        const label = t('export.running', { format })
        toast.loading(label, {
          id: task.id,
          description: (
            <ExportProgressDescription
              label={label}
              message={task.message}
              outputName={getOutputName(task.output_path)}
              progress={task.progress}
            />
          ),
          icon: (
            <span aria-hidden="true">
              <Spinner className="size-4" />
            </span>
          ),
          action: taskAction(task.id, t('export.cancel'), () => exportApi.cancelExport(task.id)),
        })
        return
      }

      if (task.status === 'finished') {
        toast.success(t('export.finished', { format }), {
          id: task.id,
          description,
          action: taskAction(task.id, t('export.openFile'), () =>
            exportApi.openExportedFile(task.output_path),
          ),
        })
        return
      }

      if (task.status === 'cancelled') {
        toast.info(t('export.cancelled', { format }), {
          id: task.id,
          description,
        })
        return
      }

      toast.error(t('export.failed', { format }), {
        id: task.id,
        description,
      })
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
  }, [])

  return null
}

export default ExportStatusOverlay
