import { Clock, FileText, Terminal } from 'lucide-react'
import { EmptyState, Section, StatusRow } from '@/components/status-center/StatusCenterRows'
import {
  basename,
  formatExportLabel,
  formatTime,
  type ExportTaskEntry,
  type TerminalEventEntry,
} from '@/components/status-center/statusCenterModel'
import { TaskStatusRow, type TaskStatusLabels } from '@/components/status-center/TaskStatusRow'
import { exportApi } from '@/services/exportApi'

type StatusCenterExportSectionProps = {
  eventError?: string | null
  labels: TaskStatusLabels
  recentExportTasks: ExportTaskEntry[]
  terminalEvents: TerminalEventEntry[]
  terminalOpen: boolean
  text: {
    closed: string
    noEvents: string
    open: string
    section: string
    unavailable: string
  }
  translate: (key: string, options?: Record<string, unknown>) => string
}

export const StatusCenterExportSection = ({
  eventError,
  labels,
  recentExportTasks,
  terminalEvents,
  terminalOpen,
  text,
  translate,
}: StatusCenterExportSectionProps) => (
  <Section title={text.section}>
    <div className="flex flex-col gap-2">
      {eventError ? (
        <TaskStatusRow
          details={eventError}
          dotClassName="bg-destructive"
          labels={labels}
          meta={text.unavailable}
        >
          {text.unavailable}
        </TaskStatusRow>
      ) : null}
      <StatusRow
        dotClassName={terminalOpen ? 'bg-primary' : 'bg-muted-foreground/45'}
        meta={terminalEvents[0] ? formatTime(terminalEvents[0].updatedAt) : undefined}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Terminal aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">
            {terminalEvents[0]?.message ?? (terminalOpen ? text.open : text.closed)}
          </span>
        </span>
      </StatusRow>
      {recentExportTasks.length > 0 ? (
        recentExportTasks.map((task) => (
          <TaskStatusRow
            key={task.id}
            dotClassName={
              task.status === 'failed'
                ? 'bg-destructive'
                : task.status === 'started'
                  ? 'bg-primary'
                  : 'bg-muted-foreground'
            }
            details={task.status === 'failed' ? task.message : undefined}
            labels={labels}
            meta={`${basename(task.output_path)} · ${
              task.status === 'started' && task.progress != null
                ? `${Math.round(task.progress * 100)}% · `
                : ''
            }${formatTime(task.updatedAt)}`}
            onCancel={task.status === 'started' ? () => exportApi.cancelExport(task.id) : undefined}
            onOpen={
              task.status === 'finished'
                ? () => exportApi.openExportedFile(task.output_path)
                : undefined
            }
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {task.status === 'started' ? (
                <Clock aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <FileText aria-hidden="true" className="size-3.5 shrink-0" />
              )}
              <span className="truncate">
                {formatExportLabel(task, (key, options) => translate(key, options))}
              </span>
            </span>
          </TaskStatusRow>
        ))
      ) : (
        <EmptyState label={text.noEvents} />
      )}
    </div>
  </Section>
)
