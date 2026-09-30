import { useEffect } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'
import { Spinner } from '@/components/ui/spinner'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { exportApi } from '@/services/exportApi'

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

const getProgressDescription = (task: ExportTaskPayload) => {
  const details = [task.message, getOutputName(task.output_path)]
  if (typeof task.progress === 'number') details.push(`${Math.round(task.progress * 100)}%`)
  return details.filter(Boolean).join(' · ')
}

const ExportStatusOverlay = () => {
  const { t } = useI18n()

  useEffect(() => {
    if (!isDesktopRuntime()) return

    let unlisten: (() => void) | undefined
    let disposed = false

    void listen<ExportTaskPayload>('export-task', (event) => {
      const task = event.payload
      const format = getFormatLabel(task.format)
      const description = getToastDescription(task)

      if (task.status === 'started') {
        toast.loading(t('export.running', { format }), {
          id: task.id,
          description: getProgressDescription(task),
          icon: (
            <span aria-hidden="true">
              <Spinner className="size-4" />
            </span>
          ),
          action: {
            label: t('export.cancel'),
            onClick: () => {
              void exportApi.cancelExport(task.id)
            },
          },
        })
        return
      }

      if (task.status === 'finished') {
        toast.success(t('export.finished', { format }), {
          id: task.id,
          description,
          action: {
            label: t('export.openFile'),
            onClick: () => {
              void exportApi.openExportedFile(task.output_path)
            },
          },
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
  }, [t])

  return null
}

export default ExportStatusOverlay
